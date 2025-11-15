"use strict";

import paypal from "@paypal/checkout-server-sdk";
import db from "../../models/index.js";
import {
  clearCustomerCart,
  recordPaymentActivity,
  prepareOrderForFulfillment
} from "../order/orderFulfillment.service.js";
import { preparePendingOrderPayload, createOrderFromPendingPayload } from "./pendingOrder.helper.js";

const { Order, Payment, sequelize } = db;

class PaypalServiceError extends Error {
  constructor(message, statusCode = 400, code = "PAYPAL_ERROR", metadata = {}) {
    super(message);
    this.name = "PaypalServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

const ensurePaypalConfig = () => {
  const cfg = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
    currency: process.env.PAYPAL_CURRENCY || "USD",
    returnUrl: process.env.PAYPAL_RETURN_URL || "http://localhost:3000/api/payments/paypal/return",
    cancelUrl: process.env.PAYPAL_CANCEL_URL || "http://localhost:3000/api/payments/paypal/cancel"
  };

  if (!cfg.clientId || !cfg.clientSecret) {
    throw new PaypalServiceError("Thieu cau hinh PAYPAL_CLIENT_ID hoac PAYPAL_CLIENT_SECRET", 500, "PAYPAL_CONFIG_MISSING");
  }
  return cfg;
};

let cachedClient = null;

const getPaypalClient = () => {
  if (cachedClient) {
    return cachedClient;
  }

  const { clientId, clientSecret } = ensurePaypalConfig();
  const environment =
    (process.env.PAYPAL_ENVIRONMENT || "").toLowerCase() === "live"
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
  cachedClient = new paypal.core.PayPalHttpClient(environment);
  return cachedClient;
};

const formatCurrencyValue = (amount) => {
  const value = Number(amount || 0);
  return value.toFixed(2);
};

const ensureOrderAccessible = (order, { orderId, userId, role }) => {
  if (!order) {
    throw new PaypalServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND", { orderId });
  }

  if (["canceled", "refunded"].includes(order.status)) {
    throw new PaypalServiceError("Don hang khong hop le de thanh toan", 400, "ORDER_INVALID_STATUS", {
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
    throw new PaypalServiceError("Khong du quyen thanh toan don hang nay", 403, "ORDER_FORBIDDEN", {
      orderId
    });
  }

  return order;
};

const createPaypalOrder = async (orderId, context = {}, options = {}) => {
  const cfg = ensurePaypalConfig();
  let order = null;
  let pendingOrder = null;
  if (orderId) {
    order = await Order.findByPk(orderId);
    ensureOrderAccessible(order, { orderId, userId: context.userId, role: context.role });
  } else if (options.pendingOrder) {
    try {
      pendingOrder = await preparePendingOrderPayload(options.pendingOrder, {
        userId: context.userId,
        defaultPaymentMethod: "paypal"
      });
    } catch (error) {
      throw new PaypalServiceError(error.message, 422, error.code || "PENDING_ORDER_INVALID");
    }
  } else {
    throw new PaypalServiceError("Thieu orderId hoac orderPayload", 400, "PAYPAL_ORDER_REQUIRED");
  }

  const amountValue = formatCurrencyValue(order ? order.total_amount : pendingOrder.totalAmount);
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: `ORDER-${order ? order.order_id : "pending"}`,
        amount: {
          currency_code: cfg.currency.toUpperCase(),
          value: amountValue
        }
      }
    ],
    application_context: {
      return_url: cfg.returnUrl,
      cancel_url: cfg.cancelUrl,
      user_action: "PAY_NOW"
    }
  });

  const client = getPaypalClient();
  const response = await client.execute(request);
  const approvalUrl = response?.result?.links?.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) {
    throw new PaypalServiceError("Khong lay duoc duong dan thanh toan PayPal", 500, "PAYPAL_APPROVAL_URL_MISSING");
  }

  await Payment.create({
    order_id: order ? order.order_id : null,
    provider: "paypal",
    amount: Number(order ? order.total_amount || 0 : pendingOrder.totalAmount),
    currency: cfg.currency.toUpperCase(),
    txn_ref: response.result.id,
    status: "initiated",
    meta: {
      paypal_order: response.result,
      ...(pendingOrder ? { pending_order: pendingOrder } : {})
    }
  });

  return { approvalUrl, paypalOrderId: response.result.id };
};

const markPaymentAsSuccess = async (paypalOrderId, capturePayload = {}) => {
  const payment = await Payment.findOne({ where: { txn_ref: paypalOrderId } });
  if (!payment) {
    return null;
  }

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
        meta: {
          ...(payment.meta || {}),
          paypal_capture: capturePayload
        }
      },
      { transaction: t }
    );

    if (order) {
      if (needsFulfillment || !["paid", "completed"].includes(order.status)) {
        if (!["paid", "completed"].includes(order.status)) {
          await order.update({ status: "paid" }, { transaction: t });
        }
        await prepareOrderForFulfillment(order, { transaction: t });
        await recordPaymentActivity(order, "paypal", {
          paymentId: payment.payment_id,
          txn_ref: payment.txn_ref
        });
      }
      orderUserId = order.user_id;
    }
  });

  if (orderUserId) {
    await clearCustomerCart(orderUserId);
  }
  return payment;
};

const capturePaypalOrder = async (paypalOrderId) => {
  if (!paypalOrderId) {
    throw new PaypalServiceError("Thieu paypalOrderId", 400, "PAYPAL_TOKEN_MISSING");
  }
  const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
  request.requestBody({});
  const client = getPaypalClient();
  try {
    const response = await client.execute(request);
    if (response?.result?.status === "COMPLETED") {
      await markPaymentAsSuccess(paypalOrderId, response.result);
      return { ok: true, data: response.result };
    }
    return { ok: false, data: response.result };
  } catch (error) {
    throw new PaypalServiceError(error.message || "Khong capture duoc don hang PayPal", 500, "PAYPAL_CAPTURE_FAILED", {
      paypalOrderId
    });
  }
};

const verifyPaypalWebhook = async (req) => {
  const cfg = ensurePaypalConfig();
  if (!cfg.webhookId) {
    throw new PaypalServiceError("Thieu PAYPAL_WEBHOOK_ID de xac thuc webhook", 500, "PAYPAL_WEBHOOK_ID_MISSING");
  }

  const authAlgo = req.headers["paypal-auth-algo"];
  const certUrl = req.headers["paypal-cert-url"];
  const transmissionId = req.headers["paypal-transmission-id"];
  const transmissionSig = req.headers["paypal-transmission-sig"];
  const transmissionTime = req.headers["paypal-transmission-time"];

  const webhookEvent = req.body;
  const verifyRequest = {
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    webhookId: cfg.webhookId,
    webhookEvent
  };

  const response = await paypal.notification.webhookEvent.verify(getPaypalClient(), verifyRequest);
  return response && response.verification_status === "SUCCESS";
};

const handlePaypalWebhookEvent = async (event) => {
  const eventType = event?.event_type;
  const resource = event?.resource || {};
  const paypalOrderId = resource.id || resource?.supplementary_data?.related_ids?.order_id;
  if (!paypalOrderId) {
    return;
  }
  if (eventType === "CHECKOUT.ORDER.APPROVED" || eventType === "PAYMENT.CAPTURE.COMPLETED") {
    await markPaymentAsSuccess(paypalOrderId, resource);
  }
};

export {
  PaypalServiceError,
  createPaypalOrder,
  capturePaypalOrder,
  verifyPaypalWebhook,
  handlePaypalWebhookEvent
};
