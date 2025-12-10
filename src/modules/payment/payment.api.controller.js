"use strict";

import db from "../../models/index.js";
import { PaymentServiceError, createVnpayPaymentUrl, verifyVnpReturn, handleVnpIpn } from "./vnpay.service.js";
import { PaypalServiceError, createPaypalOrder, capturePaypalOrder, verifyPaypalWebhook, handlePaypalWebhookEvent } from "./paypal.service.js";
import {
  VietQrError,
  createVietqrPayment,
  confirmVietqrPayment,
  cancelVietqrPayment,
  queryVietqrPayment,
  handleVietqrWebhook
} from "./vietqr.service.js";
import {
  StripeServiceError,
  createStripePaymentIntent,
  handleStripeWebhook,
  finalizeStripePayment
} from "./stripe.service.js";
import { preparePendingOrderPayload } from "./pendingOrder.helper.js";

const resolveUserId = (req) => Number(req?.auth?.user_id || req?.session?.user?.user_id);
const resolveRole = (req) => String(req?.auth?.role || req?.session?.user?.role || "");
const toPlain = (item) => (item?.get ? item.get({ plain: true }) : item);

const handleError = (res, error) => {
  if (error instanceof PaymentServiceError || error instanceof PaypalServiceError || error instanceof StripeServiceError) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
  }
  console.error("Payment API error:", error);
  return res.status(500).json({ success: false, message: "Co loi xay ra, vui long thu lai sau." });
};

// Initiate VNPAY payment and return redirect URL
const createVnpayUrlHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = req.body?.orderId ? Number(req.body.orderId) : req.query?.orderId ? Number(req.query.orderId) : undefined;
    const orderPayload = req.body?.orderPayload;
    if (!orderId && !orderPayload) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac orderPayload" });
    }

    const withDebug = String(req.query?.debug || "").toLowerCase() === "1" || String(req.query?.debug || "").toLowerCase() === "true";
    const { payUrl, txnRef, debug } = await createVnpayPaymentUrl(req, {
      orderId,
      bankCode: req.body?.bankCode || req.query?.bankCode,
      locale: req.body?.locale || req.query?.locale,
      withDebug,
      userId,
      role
    }, { pendingOrder: orderPayload });
    const payload = { payUrl, txnRef };
    if (withDebug && debug) payload.debug = debug;
    return res.json({ success: true, data: payload });
  } catch (error) {
    return handleError(res, error);
  }
};

// VNPAY return URL (browser redirect)
const vnpayReturnHandler = async (req, res) => {
  try {
    const result = await verifyVnpReturn(req.query || {});
    return res.json({ success: result.ok, data: result });
  } catch (error) {
    return handleError(res, error);
  }
};

// VNPAY IPN (server-to-server notify)
const vnpayIpnHandler = async (req, res) => {
  try {
    const result = await handleVnpIpn(req.query || {});
    return res.json(result);
  } catch (error) {
    console.error("VNPAY IPN error:", error);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

export { createVnpayUrlHandler, vnpayReturnHandler, vnpayIpnHandler };

// Query payment status by orderId or txnRef
const getVnpayStatusHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    const orderId = req.query?.orderId ? Number(req.query.orderId) : undefined;
    const txnRef = req.query?.txnRef ? String(req.query.txnRef) : undefined;
    if (!orderId && !txnRef) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac txnRef" });
    }

    const where = {};
    if (orderId) where.order_id = orderId;
    if (txnRef) where.txn_ref = txnRef;

    const payment = await db.Payment.findOne({
      where,
      include: [{ model: db.Order }],
      order: [["created_at", "DESC"]]
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Khong tim thay giao dich" });
    }
    if (role !== "admin") {
      const ownerId = payment?.Order?.user_id;
      if (!userId || ownerId !== userId) {
        return res.status(403).json({ success: false, message: "Khong du quyen xem giao dich nay" });
      }
    }

    return res.json({ success: true, data: toPlain(payment) });
  } catch (error) {
    return handleError(res, error);
  }
};

export { getVnpayStatusHandler };

// Server-side redirect helper (avoid SPA interference)
const redirectToVnpayHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return res.status(401).send("Unauthorized");
    const orderId = Number(req.query?.orderId);
    if (!orderId) return res.status(400).send("Missing orderId");
    const { payUrl } = await createVnpayPaymentUrl(req, {
      orderId,
      bankCode: req.query?.bankCode,
      locale: req.query?.locale,
      userId,
      role
    });
    return res.redirect(payUrl);
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      return res.status(error.statusCode || 400).send(error.message);
    }
    console.error("VNPAY redirect error:", error);
    return res.status(500).send("Internal Server Error");
  }
};

export { redirectToVnpayHandler };

// COD: create a record and keep order pending/confirmed for cash collection
const createCodHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId && role !== "admin") return res.status(401).json({ success: false, message: "Chua dang nhap" });

    const orderId = Number(req.body?.orderId || req.query?.orderId);
    const orderPayload = req.body?.orderPayload;

    if (!orderId && !orderPayload) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac orderPayload" });
    }

    // Case 1: create payment for an existing order
    if (orderId) {
      const order = await db.Order.findByPk(orderId);
      if (!order) return res.status(404).json({ success: false, message: "Khong tim thay don hang" });
      if (order.user_id !== userId && role !== "admin") {
        return res.status(403).json({ success: false, message: "Khong du quyen" });
      }
      const payment = await db.Payment.create({
        order_id: orderId,
        provider: "cod",
        amount: Number(order.total_amount || 0),
        currency: "VND",
        status: "initiated",
        meta: { note: "Thanh toan khi nhan hang", unpaid: true }
      });
      return res.json({
        success: true,
        data: { order: toPlain(order), payment: toPlain(payment) }
      });
    }

    // Case 2: create order + payment from payload (sandbox-friendly)
    const targetUserId =
      role === "admin" && Number(orderPayload?.userId)
        ? Number(orderPayload.userId)
        : userId;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Khong xac dinh duoc userId" });
    }

    const pending = await preparePendingOrderPayload(orderPayload, {
      userId: targetUserId,
      defaultPaymentMethod: "cod"
    });

    const { order, payment } = await db.sequelize.transaction(async (transaction) => {
      const order = await db.Order.create(
        {
          user_id: pending.userId,
          total_amount: pending.totalAmount,
          delivery_fee: pending.shippingFee || 0,
          original_amount: pending.itemsSubtotal,
          status: "pending",
          payment_method: "cod",
          note: pending.note,
          expected_delivery_time: pending.expectedDeliveryTime
            ? new Date(pending.expectedDeliveryTime)
            : null
        },
        { transaction }
      );

      await db.OrderItem.bulkCreate(
        pending.orderItemsPayload.map((item) => ({ ...item, order_id: order.order_id })),
        { transaction }
      );

      const payment = await db.Payment.create(
        {
          order_id: order.order_id,
          provider: "cod",
          amount: pending.totalAmount,
          currency: "VND",
          status: "initiated",
          meta: { note: orderPayload?.note || "Thanh toan khi nhan hang", unpaid: true }
        },
        { transaction }
      );

      return { order, payment };
    });

    return res.status(201).json({
      success: true,
      data: { order: toPlain(order), payment: toPlain(payment) }
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// VietQR: return QR image URL for transfer
const createVietqrHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = req.body?.orderId ? Number(req.body.orderId) : req.query?.orderId ? Number(req.query.orderId) : undefined;
    const pendingOrderPayload = req.body?.orderPayload || req.body?.pendingOrder;
    if (!orderId && !pendingOrderPayload) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac orderPayload" });
    }
    const payload = await createVietqrPayment(orderId, { userId, role }, { pendingOrder: pendingOrderPayload });
    return res.json({ success: true, data: payload });
  } catch (error) {
    if (error instanceof VietQrError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

const confirmVietqrHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = Number(req.body?.orderId || req.query?.orderId);
    if (!orderId) return res.status(400).json({ success: false, message: "Thieu orderId" });
    const result = await confirmVietqrPayment(userId, orderId);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof VietQrError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

const cancelVietqrHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = Number(req.body?.orderId || req.query?.orderId);
    if (!orderId) return res.status(400).json({ success: false, message: "Thieu orderId" });
    const reason = req.body?.reason || req.query?.reason;
    const result = await cancelVietqrPayment(userId, orderId, { role: resolveRole(req), reason });
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof VietQrError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

const queryVietqrHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = Number(req.body?.orderId || req.query?.orderId);
    if (!orderId) return res.status(400).json({ success: false, message: "Thieu orderId" });
    const result = await queryVietqrPayment(orderId, { userId, role: resolveRole(req) });
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof VietQrError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

const vietqrWebhookHandler = async (req, res) => {
  try {
    const result = await handleVietqrWebhook(req.body, req.headers);
    return res.json(result);
  } catch (error) {
    if (error instanceof VietQrError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    console.error("VietQR webhook error:", error);
    return res.status(500).json({ success: false, message: "Co loi khi xu ly webhook VietQR" });
  }
};

export {
  createCodHandler,
  createVietqrHandler,
  confirmVietqrHandler,
  cancelVietqrHandler,
  queryVietqrHandler,
  vietqrWebhookHandler
};

const createPaypalOrderHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = req.body?.orderId ? Number(req.body.orderId) : req.query?.orderId ? Number(req.query.orderId) : undefined;
    const orderPayload = req.body?.orderPayload;
    if (!orderId && !orderPayload) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac orderPayload" });
    }
    const { approvalUrl, paypalOrderId } = await createPaypalOrder(orderId, { userId, role }, { pendingOrder: orderPayload });
    return res.json({ success: true, data: { approvalUrl, paypalOrderId } });
  } catch (error) {
    return handleError(res, error);
  }
};

const paypalReturnHandler = async (req, res) => {
  try {
    const token = req.query?.token;
    if (!token) {
      return res.status(400).send("Missing PayPal token");
    }
    const result = await capturePaypalOrder(token);
    if (process.env.PAYPAL_SUCCESS_REDIRECT) {
      const redirectUrl = `${process.env.PAYPAL_SUCCESS_REDIRECT}?status=${result.ok ? "success" : "failed"}&provider=paypal`;
      return res.redirect(redirectUrl);
    }
    return res.json({ success: result.ok, data: result.data });
  } catch (error) {
    if (process.env.PAYPAL_FAILURE_REDIRECT) {
      return res.redirect(`${process.env.PAYPAL_FAILURE_REDIRECT}?status=failed&message=${encodeURIComponent(error.message)}`);
    }
    return handleError(res, error);
  }
};

const paypalCancelHandler = async (req, res) => {
  if (process.env.PAYPAL_CANCEL_REDIRECT) {
    return res.redirect(`${process.env.PAYPAL_CANCEL_REDIRECT}?status=cancelled`);
  }
  return res.status(200).send("Giao dich PayPal da bi huy.");
};

const paypalWebhookHandler = async (req, res) => {
  try {
    const verified = await verifyPaypalWebhook(req);
    if (!verified) {
      return res.status(400).send("Invalid PayPal webhook signature");
    }
    await handlePaypalWebhookEvent(req.body);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return res.status(error.statusCode || 500).send(error.message || "Webhook error");
  }
};

const createStripeIntentHandler = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return res.status(401).json({ success: false, message: "Chua dang nhap" });
    const orderId = req.body?.orderId ? Number(req.body.orderId) : req.query?.orderId ? Number(req.query.orderId) : undefined;
    const orderPayload = req.body?.orderPayload;
    if (!orderId && !orderPayload) {
      return res.status(400).json({ success: false, message: "Thieu orderId hoac orderPayload" });
    }
    const data = await createStripePaymentIntent(orderId, { userId, role }, { pendingOrder: orderPayload });
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof StripeServiceError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

const stripeWebhookHandler = async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      console.error("Stripe webhook: missing signature header");
      return res.status(400).send("Missing stripe-signature");
    }
    // Prefer the preserved raw buffer; fall back to body if not available
    const rawBody = req.rawBody || req.body;
    console.log("[Stripe webhook] Processing event");
    console.log("[Stripe webhook] Signature header present:", Boolean(signature));
    console.log("[Stripe webhook] Has raw body:", Boolean(req.rawBody));
    const event = await handleStripeWebhook(signature, rawBody);
    if (event?.type) {
      console.log("[Stripe webhook] received event:", event.type, "id:", event?.data?.object?.id);
    }
    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    if (error instanceof StripeServiceError) {
      return res.status(error.statusCode || 400).send(error.message);
    }
    return res.status(500).send("Webhook error");
  }
};

const stripeWebhookDebugHandler = async (req, res) => {
  try {
    const hasSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
    const secretLength = process.env.STRIPE_WEBHOOK_SECRET?.length || 0;
    return res.json({
      success: true,
      webhookConfig: {
        webhookUrl: "/api/payments/stripe/webhook",
        hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
        hasStripeWebhookSecret: hasSecret,
        webhookSecretLength: secretLength,
        webhookSecretPrefix: hasSecret ? process.env.STRIPE_WEBHOOK_SECRET.substring(0, 10) : "N/A",
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const finalizeStripePaymentHandler = async (req, res) => {
  try {
    const { paymentIntentId, txnRef } = req.body || {};
    const id = paymentIntentId || txnRef;

    if (!id) {
      return res.status(400).json({ success: false, message: "paymentIntentId hoac txnRef bat buoc" });
    }

    const data = await finalizeStripePayment(id);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof StripeServiceError) {
      return res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });
    }
    return handleError(res, error);
  }
};

// Test endpoint - Trigger payment success manually (development only)
const testStripePaymentSuccessHandler = async (req, res) => {
  try {
    const { paymentIntentId, txnRef } = req.body;

    if (!paymentIntentId && !txnRef) {
      return res.status(400).json({
        success: false,
        message: 'paymentIntentId or txnRef required'
      });
    }

    const { handleStripePaymentSuccess } = await import('./stripe.service.js');
    const id = paymentIntentId || txnRef;

    await handleStripePaymentSuccess(id, {
      type: 'payment_intent.succeeded',
      data: { object: { id } }
    });

    console.log('✅ [TEST] Payment success triggered for:', id);

    return res.json({
      success: true,
      message: 'Payment success triggered (TEST MODE)',
      paymentIntentId: id
    });
  } catch (error) {
    console.error('❌ Test payment error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export {
  createPaypalOrderHandler,
  paypalReturnHandler,
  paypalCancelHandler,
  paypalWebhookHandler,
  createStripeIntentHandler,
  stripeWebhookHandler,
  stripeWebhookDebugHandler,
  finalizeStripePaymentHandler,
  testStripePaymentSuccessHandler
};

// --- Admin manual payment flow ---
const createAdminManualPaymentHandler = async (req, res) => {
  try {
    const role = resolveRole(req);
    if (role !== "admin") return res.status(403).json({ success: false, message: "Khong du quyen" });

    const orderId = Number(req.body?.orderId);
    const provider = String(req.body?.provider || "cash").toLowerCase();
    const amount = Number(req.body?.amount);
    const currency = req.body?.currency || "VND";
    const meta = req.body?.meta || {};

    if (!orderId) return res.status(400).json({ success: false, message: "Thieu orderId" });

    const order = await db.Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Khong tim thay don hang" });

    const payment = await db.Payment.create({
      order_id: orderId,
      provider,
      amount: Number.isFinite(amount) && amount > 0 ? amount : Number(order.total_amount || 0),
      currency,
      status: "initiated",
      meta: { ...meta, createdBy: "admin" }
    });

    return res.status(201).json({ success: true, data: toPlain(payment) });
  } catch (error) {
    return handleError(res, error);
  }
};

const completeAdminManualPaymentHandler = async (req, res) => {
  try {
    const role = resolveRole(req);
    if (role !== "admin") return res.status(403).json({ success: false, message: "Khong du quyen" });

    const paymentId = req.body?.paymentId ? Number(req.body.paymentId) : undefined;
    const orderId = req.body?.orderId ? Number(req.body.orderId) : undefined;
    const txnRef = req.body?.txnRef ? String(req.body.txnRef) : undefined;
    const meta = req.body?.meta || {};

    if (!paymentId && !orderId) {
      return res.status(400).json({ success: false, message: "Can paymentId hoac orderId" });
    }

    const payment = await db.Payment.findOne({
      where: paymentId ? { payment_id: paymentId } : { order_id: orderId },
      order: [["created_at", "DESC"]]
    });

    if (!payment) return res.status(404).json({ success: false, message: "Khong tim thay giao dich" });

    await payment.update({
      status: "success",
      txn_ref: txnRef || payment.txn_ref,
      meta: { ...(payment.meta || {}), ...meta, settledBy: "admin", settledAt: new Date() }
    });

    const order = await db.Order.findByPk(payment.order_id);
    if (order) {
      await order.update({
        status: order.status === "pending" ? "paid" : order.status,
        payment_method: payment.provider
      });
    }

    return res.json({ success: true, data: toPlain(payment) });
  } catch (error) {
    return handleError(res, error);
  }
};

export { createAdminManualPaymentHandler, completeAdminManualPaymentHandler };
