"use strict";

import Stripe from "stripe";
import db from "../../models/index.js";
import {
  clearCustomerCart,
  recordPaymentActivity,
  prepareOrderForFulfillment
} from "../order/orderFulfillment.service.js";
import { emitToStaff, emitToUser } from "../../realtime/io.js";
import { preparePendingOrderPayload, createOrderFromPendingPayload } from "./pendingOrder.helper.js";

const { Order, Payment, sequelize } = db;

class StripeServiceError extends Error {
  constructor(message, statusCode = 400, code = "STRIPE_ERROR", metadata = {}) {
    super(message);
    this.name = "StripeServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

const ensureStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeServiceError("Thieu cau hinh STRIPE_SECRET_KEY", 500, "STRIPE_CONFIG_MISSING");
  }
  return new Stripe(secretKey, { apiVersion: "2023-10-16" });
};

let cachedStripe = null;

const getStripe = () => {
  if (!cachedStripe) {
    cachedStripe = ensureStripeClient();
  }
  return cachedStripe;
};

const getStripeCurrency = () => (process.env.STRIPE_CURRENCY || "vnd").toLowerCase();

const toStripeAmount = (value) => {
  const currency = getStripeCurrency();
  const numeric = Number(value || 0);
  if (["jpy", "vnd", "krw"].includes(currency)) {
    return Math.round(numeric);
  }
  return Math.round(numeric * 100);
};

const ensureOrderAccessible = (order, { orderId, userId, role }) => {
  if (!order) {
    throw new StripeServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND", { orderId });
  }

  if (["canceled", "refunded"].includes(order.status)) {
    throw new StripeServiceError("Don hang khong hop le de thanh toan", 400, "ORDER_INVALID_STATUS", {
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
    throw new StripeServiceError("Khong du quyen thanh toan don hang nay", 403, "ORDER_FORBIDDEN", {
      orderId
    });
  }
  return order;
};

const createStripePaymentIntent = async (orderId, context = {}, options = {}) => {
  const stripe = getStripe();
  let order = null;
  let pendingOrder = null;
  if (orderId) {
    order = await Order.findByPk(orderId);
    ensureOrderAccessible(order, { orderId, userId: context.userId, role: context.role });
  } else if (options.pendingOrder) {
    try {
      pendingOrder = await preparePendingOrderPayload(options.pendingOrder, {
        userId: context.userId,
        defaultPaymentMethod: "stripe"
      });
    } catch (error) {
      throw new StripeServiceError(error.message, 422, error.code || "PENDING_ORDER_INVALID");
    }
  } else {
    throw new StripeServiceError("Thieu orderId hoac orderPayload", 400, "ORDER_ID_REQUIRED");
  }

  const amountValue = Number(order ? order.total_amount : pendingOrder.totalAmount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new StripeServiceError("So tien khong hop le", 400, "STRIPE_INVALID_AMOUNT");
  }
  const amount = toStripeAmount(amountValue);
  const currency = getStripeCurrency();

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: {
      order_id: order ? String(order.order_id) : ""
    },
    automatic_payment_methods: { enabled: true }
  });

  await Payment.create({
    order_id: order ? order.order_id : null,
    provider: "stripe",
    amount: amountValue,
    currency: currency.toUpperCase(),
    txn_ref: paymentIntent.id,
    status: "initiated",
    meta: {
      stripe_pi: paymentIntent.id,
      ...(pendingOrder ? { pending_order: pendingOrder } : {})
    }
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: amountValue,
    currency: currency.toUpperCase()
  };
};

const handleStripePaymentSuccess = async (paymentIntentId, payload = {}) => {
  const payment = await Payment.findOne({ where: { txn_ref: paymentIntentId } });
  if (!payment) return;
  if (payment.status === "success") return;

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
          stripe_event: payload
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
        await recordPaymentActivity(order, "stripe", {
          paymentId: payment.payment_id,
          txn_ref: payment.txn_ref
        });
      }
      orderUserId = order.user_id;
    }
  });

  if (orderUserId) {
    await clearCustomerCart(orderUserId);
    emitToUser(orderUserId, "order:payment-updated", {
      orderId: payment.order_id,
      status: "paid",
      provider: "stripe"
    });
  }
  emitToStaff("orders:payment-updated", {
    orderId: payment.order_id,
    status: "paid",
    provider: "stripe"
  });
};

const handleStripeWebhook = async (signature, rawBody) => {
  const stripe = getStripe();
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    throw new StripeServiceError("Thieu STRIPE_WEBHOOK_SECRET", 500, "STRIPE_WEBHOOK_SECRET_MISSING");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (error) {
    throw new StripeServiceError(error.message || "Stripe webhook signature invalid", 400, "STRIPE_WEBHOOK_INVALID");
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    await handleStripePaymentSuccess(paymentIntent.id, event);
  }
  return event;
};

export { StripeServiceError, createStripePaymentIntent, handleStripeWebhook, handleStripePaymentSuccess };
