"use strict";

import crypto from "crypto";
import fetch from "node-fetch";
import db from "../../models/index.js";
import {
  clearCustomerCart,
  recordPaymentActivity,
  prepareOrderForFulfillment
} from "../order/orderFulfillment.service.js";
import { emitToStaff, emitToUser } from "../../realtime/io.js";
import { preparePendingOrderPayload, createOrderFromPendingPayload } from "./pendingOrder.helper.js";

const { Order, Payment, sequelize } = db;

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_GATEWAY_TIMEOUT_MS = 10000;
const GATEWAY_SUCCESS_MARKERS = ["SUCCESS", "COMPLETED", "00"];

class VietQrError extends Error {
  constructor(message, statusCode = 400, code = "VIETQR_ERROR", metadata = {}) {
    super(message);
    this.name = "VietQrError";
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const safeString = (value) => (value === undefined || value === null ? "" : String(value));

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const cleaned = typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const ensureVietQrConfig = () => {
  const config = {
    bank: process.env.VIETQR_BANK,
    accountNo: process.env.VIETQR_ACCOUNT_NO,
    accountName: process.env.VIETQR_ACCOUNT_NAME || "",
    gatewayUrl: process.env.VIETQR_GATEWAY_URL || "",
    gatewayMethod: (process.env.VIETQR_GATEWAY_METHOD || "POST").toUpperCase(),
    gatewayStatusUrl: process.env.VIETQR_GATEWAY_STATUS_URL || "",
    gatewayStatusMethod: (process.env.VIETQR_GATEWAY_STATUS_METHOD || process.env.VIETQR_GATEWAY_METHOD || "POST").toUpperCase(),
    gatewayApiKey: process.env.VIETQR_GATEWAY_API_KEY || "",
    gatewayApiKeyHeader: process.env.VIETQR_GATEWAY_API_KEY_HEADER || "x-api-key",
    requestTimeoutMs: parsePositiveNumber(process.env.VIETQR_GATEWAY_TIMEOUT_MS, DEFAULT_GATEWAY_TIMEOUT_MS),
    timeoutSeconds: parsePositiveNumber(process.env.VIETQR_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
    webhookSecret: process.env.VIETQR_WEBHOOK_SECRET || "",
    webhookSignatureHeader: (process.env.VIETQR_WEBHOOK_SIGNATURE_HEADER || "x-vietqr-signature").toLowerCase()
  };
  if (!config.bank || !config.accountNo) {
    throw new VietQrError("Thieu cau hinh VietQR (VIETQR_BANK, VIETQR_ACCOUNT_NO)", 500, "VIETQR_CONFIG_MISSING");
  }
  return config;
};

const buildVietQrImageUrl = ({ bank, accountNo, accountName, amount, addInfo }) => {
  const base = `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(accountNo)}-qr_only.png`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(Math.round(Number(amount || 0))));
  if (addInfo) params.set("addInfo", addInfo);
  if (accountName) params.set("accountName", accountName);
  return `${base}?${params.toString()}`;
};

const buildVietQrDescription = (orderId) => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `FF_${orderId}_${timestamp}_${random}`;
};

const normalizeRole = (role) => (role || "").toString().toLowerCase();

const ensureOrderAccessible = (order, { orderId, userId, role }) => {
  if (!order) {
    throw new VietQrError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND", { orderId });
  }
  if (["canceled", "refunded"].includes(order.status)) {
    throw new VietQrError("Don hang khong hop le de thanh toan", 400, "ORDER_INVALID_STATUS", {
      status: order.status,
      orderId
    });
  }
  if (normalizeRole(role) === "admin") {
    return order;
  }
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId) || Number(order.user_id) !== normalizedUserId) {
    throw new VietQrError("Khong du quyen thanh toan don hang nay", 403, "ORDER_FORBIDDEN", { orderId });
  }
  return order;
};

const buildPaymentResponse = (payment) => {
  const meta = payment.meta || {};
  return {
    payment_id: payment.payment_id,
    order_id: payment.order_id,
    amount: Number(payment.amount || 0),
    currency: payment.currency || "VND",
    description: payment.txn_ref,
    addInfo: meta?.description || payment.txn_ref,
    expiresAt: meta?.expires_at,
    qrImageUrl: meta?.qr_image_url,
    qrText: meta?.qr_payload,
    gatewayName: meta?.gateway_name,
    status: payment.status
  };
};

const findReusableVietqrPayment = async (orderId, config) => {
  if (!orderId) return null;
  const existing = await Payment.findOne({
    where: { order_id: orderId, provider: "vietqr", status: "initiated" },
    order: [["created_at", "DESC"]]
  });
  if (!existing || hasPaymentExpired(existing)) {
    return null;
  }
  const expiresAt = new Date(Date.now() + config.timeoutSeconds * 1000).toISOString();
  await existing.update({ meta: { ...(existing.meta || {}), expires_at: expiresAt } });
  return existing;
};

const normalizeHeaders = (headers = {}) => {
  const normalized = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (key) {
      normalized[key.toLowerCase()] = value;
    }
  });
  return normalized;
};

const extractDescriptionFromPayload = (payload = {}) => {
  return safeString(
    payload.description ||
      payload.addInfo ||
      payload.txn_ref ||
      payload.reference ||
      payload.transaction_code ||
      payload.transactionId ||
      payload.order_info ||
      payload.order_description ||
      payload.memo ||
      ""
  ).trim();
};

const computeWebhookSignature = (payload, secret) => {
  const description = extractDescriptionFromPayload(payload);
  const amount = parseNumber(
    payload.amount ??
      payload.value ??
      payload.total ??
      payload.transaction_amount ??
      payload.total_amount ??
      payload.requested_amount
  );
  const status = safeString(payload.status || payload.state || payload.result?.status || payload.response_code).toUpperCase();
  const transactionId = safeString(
    payload.transaction_id ||
      payload.txn_id ||
      payload.txnId ||
      payload.reference ||
      payload.transactionId ||
      payload.order_id
  );
  const data = `${description}|${amount ?? ""}|${status}|${transactionId}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
};

const parseRawJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseGatewayData = (candidate) => {
  const source = candidate && typeof candidate === "object" ? candidate : parseRawJson(candidate) || {};
  const amount = parseNumber(
    source.amount ??
      source.value ??
      source.total_amount ??
      source.total ??
      source.grand_total ??
      source.transaction_amount ??
      source.requested_amount
  );
  const status = safeString(
    source.status ||
      source.state ||
      source.result?.status ||
      source.response_code ||
      source.code ||
      source.gateway_status
  ).toUpperCase();
  const transactionId = safeString(
    source.transaction_id ||
      source.txn_id ||
      source.txnId ||
      source.reference ||
      source.order_id ||
      source.transactionId
  );
  const qrImageUrl = safeString(source.qrImageUrl || source.qr_url || source.image || source.url || source.qr).trim();
  const qrText = safeString(source.qrText || source.payload || source.content || source.qr).trim();
  return {
    amount,
    status,
    transactionId,
    qrImageUrl: qrImageUrl || null,
    qrText: qrText || null,
    raw: source
  };
};

const isStatusSuccess = (status) => {
  if (!status) return false;
  const normalized = status.toString().toUpperCase();
  return GATEWAY_SUCCESS_MARKERS.some((marker) => normalized.includes(marker));
};

const buildGatewayHeaders = (config) => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (config.gatewayApiKey) {
    headers[config.gatewayApiKeyHeader] = config.gatewayApiKey;
  }
  return headers;
};

const readResponsePayload = async (response) => {
  const text = await response.text();
  if (!text) {
    return { body: null, raw: "" };
  }
  try {
    return { body: JSON.parse(text), raw: text };
  } catch {
    return { body: null, raw: text };
  }
};

const performGatewayRequest = async (url, method, payload, config) => {
  try {
    const response = await fetch(url, {
      method,
      headers: buildGatewayHeaders(config),
      body: JSON.stringify(payload),
      timeout: config.requestTimeoutMs
    });
    const parsed = await readResponsePayload(response);
    return { ok: response.ok, status: response.status, body: parsed.body, raw: parsed.raw };
  } catch (error) {
    const isTimeout = error?.type === "request-timeout";
    throw new VietQrError(
      isTimeout ? "Timeout khi ket noi cong dich VietQR" : "Khong the ket noi toi cong dich VietQR",
      isTimeout ? 504 : 502,
      isTimeout ? "VIETQR_GATEWAY_TIMEOUT" : "VIETQR_GATEWAY_UNAVAILABLE",
      { detail: error?.message }
    );
  }
};

const getLatestVietqrPayment = async (orderId) =>
  Payment.findOne({ where: { order_id: orderId, provider: "vietqr" }, order: [["created_at", "DESC"]] });

const hasPaymentExpired = (payment) => {
  const expiresAt = payment?.meta?.expires_at;
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return false;
  return Date.now() > parsed;
};

const getGatewayNameFromUrl = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const buildManualQrPayload = (amount, description, config) => ({
  gatewayName: `manual-${config.bank}`,
  qrImageUrl: buildVietQrImageUrl({ bank: config.bank, accountNo: config.accountNo, accountName: config.accountName, amount, addInfo: description }),
  qrText: description
});

const markPaymentAsSuccess = async (payment, { source = "unknown", metadata = {} } = {}) => {
  if (payment.status === "success") {
    return payment;
  }
  const updatedMeta = {
    ...(payment.meta || {}),
    confirmed: true,
    confirmed_at: new Date().toISOString(),
    confirmed_source: source,
    ...metadata
  };
  let orderUserId = null;
  await sequelize.transaction(async (t) => {
    let order = null;
    if (!payment.order_id && payment.meta?.pending_order) {
      order = await createOrderFromPendingPayload(payment.meta.pending_order, { transaction: t });
      updatedMeta.pending_order = {
        ...(payment.meta.pending_order || {}),
        created_at: new Date().toISOString(),
        order_id: order.order_id
      };
      payment.order_id = order.order_id;
    }
    await payment.update({ status: "success", meta: updatedMeta, order_id: payment.order_id }, { transaction: t });
    if (!order && payment.order_id) {
      order = await Order.findByPk(payment.order_id, { transaction: t });
    }
    if (!order) {
      return;
    }
    if (!["paid", "completed"].includes(order.status)) {
      await order.update({ status: "paid", payment_method: order.payment_method || "vietqr" }, { transaction: t });
      await prepareOrderForFulfillment(order, { transaction: t });
    }
    await recordPaymentActivity(order, "vietqr", {
      paymentId: payment.payment_id,
      txn_ref: payment.txn_ref
    });
    orderUserId = order.user_id;
  });
  if (orderUserId) {
    await clearCustomerCart(orderUserId);
    emitToUser(orderUserId, "order:payment-updated", {
      orderId: payment.order_id,
      status: "paid",
      provider: "vietqr"
    });
  }
  emitToStaff("orders:payment-updated", {
    orderId: payment.order_id,
    status: "paid",
    provider: "vietqr"
  });
  return payment;
};

const markPaymentAsFailed = async (payment, { reason = "unknown", metadata = {} } = {}) => {
  const updatedMeta = {
    ...(payment.meta || {}),
    failure_reason: reason,
    failure_at: new Date().toISOString(),
    ...metadata
  };
  if (payment.status === "failed") {
    return payment;
  }
  const updatedPayment = await payment.update({ status: "failed", meta: updatedMeta });
  if (payment.order_id) {
    const order = await Order.findByPk(payment.order_id);
    if (order && order.user_id) {
      emitToUser(order.user_id, "order:payment-updated", {
        orderId: order.order_id,
        status: "failed",
        provider: "vietqr"
      });
    }
  }
  emitToStaff("orders:payment-issue", {
    orderId: payment.order_id,
    reason,
    provider: "vietqr",
    details: metadata
  });
  return updatedPayment;
};

const createVietqrPayment = async (orderId, context = {}, options = {}) => {
  const config = ensureVietQrConfig();
  let order = null;
  let pendingOrder = null;
  if (orderId) {
    order = await Order.findByPk(orderId);
    ensureOrderAccessible(order, { orderId, userId: context.userId, role: context.role });
    const reused = await findReusableVietqrPayment(orderId, config);
    if (reused) {
      return buildPaymentResponse(reused);
    }
  } else if (options.pendingOrder) {
    try {
      pendingOrder = await preparePendingOrderPayload(options.pendingOrder, {
        userId: context.userId,
        defaultPaymentMethod: "vietqr"
      });
    } catch (error) {
      throw new VietQrError(error.message, 422, error.code || "PENDING_ORDER_INVALID");
    }
  } else {
    throw new VietQrError("Thieu orderId hoac orderPayload", 400, "VIETQR_ORDER_REQUIRED");
  }

  const referenceSeed = order ? String(order.order_id) : "PENDING";
  const description = buildVietQrDescription(referenceSeed);
  const amount = Number(order ? order.total_amount : pendingOrder.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new VietQrError("So tien khong hop le", 400, "VIETQR_INVALID_AMOUNT");
  }
  const expiresAt = new Date(Date.now() + config.timeoutSeconds * 1000);

  let qrImageUrl = "";
  let qrText = description;
  let gatewayName = config.gatewayUrl ? getGatewayNameFromUrl(config.gatewayUrl) : `manual-${config.bank}`;
  const meta = {
    description,
    requested_amount: amount,
    currency: "VND",
    bank: config.bank,
    account_no: config.accountNo,
    account_name: config.accountName,
    expires_at: expiresAt.toISOString(),
    gateway_channel: config.gatewayUrl ? "gateway" : "manual"
  };
  if (pendingOrder) {
    meta.pending_order = pendingOrder;
  }

  if (config.gatewayUrl) {
    const payload = {
      description,
      amount,
      currency: "VND",
      orderId: order ? order.order_id : null,
      accountNo: config.accountNo,
      accountName: config.accountName
    };
    const response = await performGatewayRequest(config.gatewayUrl, config.gatewayMethod, payload, config);
    const metadataSource = response.body || parseRawJson(response.raw);
    const gatewayData = parseGatewayData(metadataSource);
    gatewayName = gatewayData.raw?.gateway_name || gatewayName;
    qrImageUrl = gatewayData.qrImageUrl || gatewayData.raw?.qr_image_url || "";
    qrText = gatewayData.qrText || gatewayData.raw?.qr_payload || description;
    meta.gateway_name = gatewayName;
    meta.gateway_transaction_id = gatewayData.transactionId || description;
    meta.gateway_status = gatewayData.status || "pending";
    meta.gateway_response = metadataSource || response.raw;
    meta.gateway_request = payload;
  }

  if (!qrImageUrl) {
    const manual = buildManualQrPayload(amount, description, config);
    qrImageUrl = manual.qrImageUrl;
    qrText = manual.qrText;
    meta.gateway_name = manual.gatewayName;
  }
  meta.qr_image_url = qrImageUrl;
  meta.qr_payload = qrText;

  const payment = await Payment.create({
    order_id: order ? order.order_id : null,
    provider: "vietqr",
    amount,
    currency: "VND",
    txn_ref: description,
    status: "initiated",
    meta
  });

  return buildPaymentResponse(payment);
};

const queryVietqrStatus = async (payment, config) => {
  if (!config.gatewayStatusUrl) {
    return {
      supported: false,
      success: false,
      status: payment.status,
      message: "Chua cau hinh API truy van VietQR"
    };
  }
  const payload = {
    description: payment.txn_ref,
    orderId: payment.order_id,
    amount: Number(payment.amount),
    accountNo: config.accountNo,
    accountName: config.accountName
  };
  const response = await performGatewayRequest(config.gatewayStatusUrl, config.gatewayStatusMethod, payload, config);
  const rawData = response.body || parseRawJson(response.raw);
  const gatewayData = parseGatewayData(rawData);
  if (!response.ok) {
    return {
      supported: true,
      success: false,
      status: payment.status,
      message: "Gateway tra ve loi",
      gateway: gatewayData
    };
  }
  if (gatewayData.amount && Number(gatewayData.amount) !== Number(payment.amount)) {
    await markPaymentAsFailed(payment, {
      reason: "amount_mismatch",
      metadata: {
        expected_amount: payment.amount,
        reported_amount: gatewayData.amount,
        gateway_status: gatewayData.status,
        gateway_response: rawData || response.raw
      }
    });
    return {
      supported: true,
      success: false,
      status: "failed",
      message: "So tien khong khop",
      gateway: gatewayData
    };
  }
  if (isStatusSuccess(gatewayData.status)) {
    await markPaymentAsSuccess(payment, {
      source: "gateway-query",
      metadata: {
        gateway_status: gatewayData.status,
        gateway_transaction_id: gatewayData.transactionId,
        gateway_response: rawData || response.raw
      }
    });
    return {
      supported: true,
      success: true,
      status: "success",
      message: "Thanh toan da duoc xac nhan",
      gateway: gatewayData
    };
  }
  return {
    supported: true,
    success: false,
    status: payment.status,
    message: "Cho webhook tu ngan hang",
    gateway: gatewayData
  };
};

const confirmVietqrPayment = async (userId, orderId, context = {}) => {
  const config = ensureVietQrConfig();
  const order = await Order.findByPk(orderId);
  ensureOrderAccessible(order, { orderId, userId, role: context.role });
  const payment = await getLatestVietqrPayment(orderId);
  if (!payment) {
    throw new VietQrError("Khong tim thay giao dich VietQR", 404, "PAYMENT_NOT_FOUND");
  }
  await payment.update({
    meta: {
      ...(payment.meta || {}),
      user_confirmed: true,
      user_confirmed_at: new Date().toISOString()
    }
  });
  if (payment.status === "success") {
    return { status: "success", payment: payment.get({ plain: true }) };
  }
  if (payment.status === "failed") {
    return { status: "failed", payment: payment.get({ plain: true }), message: "Giao dich da bi huy" };
  }
  if (hasPaymentExpired(payment)) {
    await markPaymentAsFailed(payment, {
      reason: "expired",
      metadata: { expiry: payment.meta?.expires_at }
    });
    throw new VietQrError("Ma QR da het han", 410, "VIETQR_EXPIRED");
  }
  const result = await queryVietqrStatus(payment, config);
  return { ...result, payment: payment.get({ plain: true }) };
};

const queryVietqrPayment = async (orderId, context = {}) => {
  const config = ensureVietQrConfig();
  const order = await Order.findByPk(orderId);
  ensureOrderAccessible(order, { orderId, userId: context.userId, role: context.role });
  const payment = await getLatestVietqrPayment(orderId);
  if (!payment) {
    throw new VietQrError("Khong tim thay giao dich VietQR", 404, "PAYMENT_NOT_FOUND");
  }
  if (hasPaymentExpired(payment)) {
    await markPaymentAsFailed(payment, {
      reason: "expired",
      metadata: { expiry: payment.meta?.expires_at }
    });
    throw new VietQrError("Ma QR da het han", 410, "VIETQR_EXPIRED");
  }
  const result = await queryVietqrStatus(payment, config);
  return { ...result, payment: payment.get({ plain: true }) };
};

const cancelVietqrPayment = async (userId, orderId, context = {}) => {
  const config = ensureVietQrConfig();
  const order = await Order.findByPk(orderId);
  ensureOrderAccessible(order, { orderId, userId, role: context.role });
  const payment = await getLatestVietqrPayment(orderId);
  if (!payment) {
    throw new VietQrError("Khong tim thay giao dich VietQR", 404, "PAYMENT_NOT_FOUND");
  }
  if (payment.status === "success") {
    throw new VietQrError("Khong the huy giao dich da thanh toan", 400, "PAYMENT_ALREADY_PAID");
  }
  await markPaymentAsFailed(payment, {
    reason: "cancelled",
    metadata: {
      cancelled_by: userId,
      cancelled_reason: context.reason || "user_cancel"
    }
  });
  return payment.get({ plain: true });
};

const handleVietqrWebhook = async (payload = {}, headers = {}) => {
  const config = ensureVietQrConfig();
  if (!payload || typeof payload !== "object") {
    throw new VietQrError("Dinh dang webhook khong hop le", 400, "WEBHOOK_INVALID_PAYLOAD");
  }
  const normalizedHeaders = normalizeHeaders(headers);
  if (config.webhookSecret) {
    const signature = normalizedHeaders[config.webhookSignatureHeader];
    if (!signature) {
      throw new VietQrError("Chu ky webhook khong duoc gui", 401, "WEBHOOK_SIGNATURE_MISSING");
    }
    const expected = computeWebhookSignature(payload, config.webhookSecret);
    if (signature !== expected) {
      throw new VietQrError("Chu ky webhook khong hop le", 401, "WEBHOOK_SIGNATURE_INVALID");
    }
  }
  const description = extractDescriptionFromPayload(payload);
  if (!description) {
    throw new VietQrError("Thieu noi dung giao dich (description/addInfo)", 400, "WEBHOOK_DESCRIPTION_MISSING");
  }
  const payment = await Payment.findOne({ where: { txn_ref: description } });
  if (!payment) {
    throw new VietQrError("Khong tim thay giao dich VietQR", 404, "PAYMENT_NOT_FOUND", { description });
  }
  const gatewayData = parseGatewayData(payload);
  const reportedAmount =
    gatewayData.amount ??
    parseNumber(payload.amount ?? payload.value ?? payload.total ?? payload.transaction_amount ?? payload.total_amount);
  if (Number.isFinite(reportedAmount) && Number(payment.amount) !== reportedAmount) {
    await markPaymentAsFailed(payment, {
      reason: "amount_mismatch",
      metadata: {
        expected_amount: payment.amount,
        reported_amount: reportedAmount,
        webhook_payload: payload
      }
    });
    return { success: false, message: "So tien khong khop voi don hang" };
  }
  if (isStatusSuccess(gatewayData.status || payload.status)) {
    await markPaymentAsSuccess(payment, {
      source: "webhook",
      metadata: {
        gateway_status: gatewayData.status,
        gateway_transaction_id: gatewayData.transactionId,
        gateway_response: payload,
        webhook_payload: payload
      }
    });
    return { success: true, message: "Thanh toan VietQR da duoc xac nhan" };
  }
  await markPaymentAsFailed(payment, {
    reason: "webhook_failed",
    metadata: {
      gateway_status: gatewayData.status,
      webhook_payload: payload
    }
  });
  return { success: false, message: "Webhook thong bao giao dich that bai" };
};

export {
  VietQrError,
  createVietqrPayment,
  confirmVietqrPayment,
  cancelVietqrPayment,
  queryVietqrPayment,
  handleVietqrWebhook
};
