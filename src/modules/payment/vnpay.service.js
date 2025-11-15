"use strict";

import crypto from "crypto";
import db from "../../models/index.js";
import {
  clearCustomerCart,
  recordPaymentActivity,
  prepareOrderForFulfillment
} from "../order/orderFulfillment.service.js";
import { preparePendingOrderPayload, createOrderFromPendingPayload } from "./pendingOrder.helper.js";

const { Order, Payment, sequelize } = db;

class PaymentServiceError extends Error {
  constructor(message, statusCode = 400, code = "PAYMENT_SERVICE_ERROR", metadata = {}) {
    super(message);
    this.name = "PaymentServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

const sortObject = (obj = {}) => {
  const sorted = {};
  const keys = Object.keys(obj).map(encodeURIComponent).sort();
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, "+");
  }
  return sorted;
};

const stringifyNoEncode = (obj = {}) =>
  Object.keys(obj)
    .map((k) => `${k}=${obj[k]}`)
    .join("&");

const normalizeIpToIPv4 = (ip) => {
  if (!ip) return "127.0.0.1";
  const first = String(ip).split(",")[0].trim();
  if (first === "::1") return "127.0.0.1";
  if (first.startsWith("::ffff:")) return first.replace("::ffff:", "");
  // Very simple IPv6 detect; fallback to localhost IPv4
  if (first.includes(":")) return "127.0.0.1";
  return first;
};

const getClientIp = (req) =>
  normalizeIpToIPv4(
    req.headers["x-forwarded-for"] || req.connection?.remoteAddress || req.socket?.remoteAddress || req.connection?.socket?.remoteAddress
  );

const ensureVnpayEnv = () => {
  const config = {
    tmnCode: process.env.VNP_TMN_CODE,
    secretKey: process.env.VNP_HASH_SECRET,
    vnpUrl: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    returnUrl: process.env.VNP_RETURN_URL,
    ipnUrl: process.env.VNP_IPN_URL || "",
    locale: process.env.VNP_LOCALE || "vn"
  };
  if (!config.tmnCode || !config.secretKey || !config.returnUrl) {
    throw new PaymentServiceError("Thieu cau hinh VNPAY (VNP_TMN_CODE, VNP_HASH_SECRET, VNP_RETURN_URL)", 500, "VNPAY_CONFIG_MISSING");
  }
  return config;
};

const formatDateTimeYMDHMS = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
};

const buildTxnRef = (orderId) => `${orderId}-${formatDateTimeYMDHMS()}`;

const ensureOrderAccessible = (order, { orderId, userId, role }) => {
  if (!order) {
    throw new PaymentServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND", { orderId });
  }

  if (["canceled", "refunded"].includes(order.status)) {
    throw new PaymentServiceError("Don hang khong hop le de thanh toan", 400, "ORDER_INVALID_STATUS", {
      status: order.status,
      orderId
    });
  }

  const normalizedRole = (role || "").toLowerCase();
  if (normalizedRole === "admin") {
    return order;
  }

  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId) || Number(order.user_id) !== normalizedUserId) {
    throw new PaymentServiceError("Khong du quyen thanh toan don hang nay", 403, "ORDER_FORBIDDEN", {
      orderId
    });
  }
  return order;
};

const createVnpayPaymentUrl = async (req, { orderId, bankCode, locale, withDebug = false, userId, role }, options = {}) => {
  const { tmnCode, secretKey, vnpUrl, returnUrl } = ensureVnpayEnv();

  let order = null;
  let pendingOrder = null;
  if (orderId) {
    order = await Order.findByPk(orderId);
    ensureOrderAccessible(order, { orderId, userId, role });
  } else if (options.pendingOrder) {
    try {
      pendingOrder = await preparePendingOrderPayload(options.pendingOrder, {
        userId,
        defaultPaymentMethod: "vnpay"
      });
    } catch (error) {
      throw new PaymentServiceError(error.message, 422, error.code || "PENDING_ORDER_INVALID");
    }
  } else {
    throw new PaymentServiceError("Thieu orderId hoac orderPayload", 400, "ORDER_ID_REQUIRED");
  }

  const amount = Number(order ? order.total_amount : pendingOrder.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentServiceError("So tien khong hop le", 400, "VNPAY_INVALID_AMOUNT");
  }
  const txnRef = buildTxnRef(order ? order.order_id : Date.now());
  const ipAddr = getClientIp(req);
  const createDate = formatDateTimeYMDHMS();

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: locale || "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan cho ma GD:${order ? order.order_id : "pending"}`,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(amount * 100),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate
  };
  if (bankCode) vnpParams.vnp_BankCode = bankCode;
  // Do not send vnp_IpnUrl in pay request; configure IPN URL in VNPAY portal instead.

  const sorted = sortObject(vnpParams);
  const signData = stringifyNoEncode(sorted);
  const hmac = crypto.createHmac("sha512", secretKey);
  const vnp_SecureHash = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  if (process.env.VNP_DEBUG_SIGN === "1") {
    console.log("[VNPAY][CREATE] signData=", signData);
    console.log("[VNPAY][CREATE] hash=", vnp_SecureHash);
  }
  const payUrl = `${vnpUrl}?${stringifyNoEncode({ ...sorted, vnp_SecureHash })}`;

  const payment = await Payment.create({
    order_id: order ? order.order_id : null,
    provider: "vnpay",
    amount,
    currency: "VND",
    txn_ref: txnRef,
    status: "initiated",
    meta: {
      created_at: new Date().toISOString(),
      ...(pendingOrder ? { pending_order: pendingOrder } : {})
    }
  });

  const response = { payUrl, txnRef };
  if (withDebug) {
    response.debug = { signData, params: sorted, payment_id: payment.payment_id };
  }
  return response;
};

const verifyVnpReturn = async (query) => {
  const { secretKey } = ensureVnpayEnv();
  const vnpParams = { ...query };
  const secureHash = vnpParams["vnp_SecureHash"];
  delete vnpParams["vnp_SecureHash"];
  delete vnpParams["vnp_SecureHashType"];

  const sorted = sortObject(vnpParams);
  const signData = stringifyNoEncode(sorted);
  const signed = crypto.createHmac("sha512", secretKey).update(Buffer.from(signData, "utf-8")).digest("hex");
  if (process.env.VNP_DEBUG_SIGN === "1") {
    console.log("[VNPAY][RETURN] signData=", signData);
    console.log("[VNPAY][RETURN] expectedHash=", signed);
    console.log("[VNPAY][RETURN] receivedHash=", secureHash);
  }

  const isValidSignature = secureHash === signed;
  const rspCode = vnpParams["vnp_ResponseCode"];
  const txnRef = vnpParams["vnp_TxnRef"];

  const payment = await Payment.findOne({ where: { txn_ref: txnRef }, include: [Order] });
  if (!payment) {
    throw new PaymentServiceError("Khong tim thay giao dich", 404, "PAYMENT_NOT_FOUND", { txnRef });
  }

  // Only log return payload for UX feedback; final status is handled by handleVnpIpn().
  const meta = {
    ...(payment.meta || {}),
    vnp_return: vnpParams,
    vnp_return_verified: isValidSignature,
    vnp_return_at: new Date().toISOString()
  };

  await payment.update({ meta });

  if (!isValidSignature) {
    return { ok: false, code: "97", message: "Chu ky khong hop le", txnRef, orderId: payment.order_id };
  }

  if (rspCode === "00") {
    return {
      ok: true,
      code: rspCode,
      message: "Thanh toan hop le. Chung toi se xac nhan khi VNPAY gui IPN.",
      txnRef,
      orderId: payment.order_id
    };
  }

  return { ok: false, code: rspCode, message: "Thanh toan that bai", txnRef, orderId: payment.order_id };
};

const handleVnpIpn = async (query) => {
  const { secretKey } = ensureVnpayEnv();
  const vnpParams = { ...query };
  const secureHash = vnpParams["vnp_SecureHash"];
  delete vnpParams["vnp_SecureHash"]; // remove from sign
  delete vnpParams["vnp_SecureHashType"];

  const sorted = sortObject(vnpParams);
  const signData = stringifyNoEncode(sorted);
  const signed = crypto.createHmac("sha512", secretKey).update(Buffer.from(signData, "utf-8")).digest("hex");
  if (process.env.VNP_DEBUG_SIGN === "1") {
    console.log("[VNPAY][IPN] signData=", signData);
    console.log("[VNPAY][IPN] expectedHash=", signed);
    console.log("[VNPAY][IPN] receivedHash=", secureHash);
  }
  const isValidSignature = secureHash === signed;

  const rspCode = vnpParams["vnp_ResponseCode"];
  const txnRef = vnpParams["vnp_TxnRef"];
  const amount = Number(vnpParams["vnp_Amount"]) / 100;

  const payment = await Payment.findOne({ where: { txn_ref: txnRef }, include: [Order] });
  if (!payment) {
    return { RspCode: "01", Message: "Order not found" };
  }

  if (!isValidSignature) {
    return { RspCode: "97", Message: "Invalid signature" };
  }

  if (Number.isFinite(amount) && payment.amount !== undefined && Number(payment.amount) !== amount) {
    return { RspCode: "04", Message: "Invalid amount" };
  }

  if (payment.status === "success") {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  if (rspCode === "00") {
    let orderUserId = null;
    await sequelize.transaction(async (t) => {
      let order = null;
      let needsFulfillment = false;
      if (!payment.order_id && payment.meta?.pending_order) {
        order = await createOrderFromPendingPayload(payment.meta.pending_order, { transaction: t });
        payment.order_id = order.order_id;
        needsFulfillment = true;
      } else if (payment.order_id) {
        order = await Order.findByPk(payment.order_id, { transaction: t });
      }
      await payment.update(
        {
          status: "success",
          order_id: payment.order_id,
          meta: { ...(payment.meta || {}), vnp: vnpParams }
        },
        { transaction: t }
      );
      if (order) {
        if (needsFulfillment || (order.status !== "paid" && order.status !== "completed")) {
          if (order.status !== "paid" && order.status !== "completed") {
            await order.update({ status: "paid" }, { transaction: t });
          }
          await prepareOrderForFulfillment(order, { transaction: t });
          await recordPaymentActivity(order, "vnpay", {
            paymentId: payment.payment_id,
            txn_ref: payment.txn_ref,
            vnpTxnRef: txnRef
          });
        }
        orderUserId = order.user_id;
      }
    });
    if (orderUserId) {
      await clearCustomerCart(orderUserId);
    }
    return { RspCode: "00", Message: "Confirm Success" };
  }

  await payment.update({ status: "failed", meta: { ...(payment.meta || {}), vnp: vnpParams } });
  return { RspCode: rspCode || "99", Message: "Payment failed" };
};

export { PaymentServiceError, createVnpayPaymentUrl, verifyVnpReturn, handleVnpIpn };

