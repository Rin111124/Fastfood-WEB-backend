import express from "express";
import { requireRoles } from "../../middleware/authMiddleware.js";
import {
  createVnpayUrlHandler,
  vnpayReturnHandler,
  vnpayIpnHandler,
  getVnpayStatusHandler,
  redirectToVnpayHandler,
  createCodHandler,
  createVietqrHandler,
  confirmVietqrHandler,
  cancelVietqrHandler,
  queryVietqrHandler,
  vietqrWebhookHandler,
  createPaypalOrderHandler,
  paypalReturnHandler,
  paypalCancelHandler,
  paypalWebhookHandler,
  createStripeIntentHandler,
  stripeWebhookHandler,
  testStripePaymentSuccessHandler
} from "./payment.api.controller.js";

const router = express.Router();

// Create payment URL (authenticated customer/admin)
router.post("/vnpay/create", requireRoles("customer", "admin"), createVnpayUrlHandler);
router.get("/vnpay/create", requireRoles("customer", "admin"), createVnpayUrlHandler);
router.get("/vnpay/redirect", requireRoles("customer", "admin"), redirectToVnpayHandler);

// VNPAY return & IPN endpoints (public, called by VNPAY)
router.get("/vnpay/return", vnpayReturnHandler);
router.get("/vnpay/ipn", vnpayIpnHandler);

// Payment status (authenticated)
router.get("/vnpay/status", requireRoles("customer", "admin"), getVnpayStatusHandler);

// PayPal
router.post("/paypal/create", requireRoles("customer", "admin"), createPaypalOrderHandler);
router.get("/paypal/create", requireRoles("customer", "admin"), createPaypalOrderHandler);
router.get("/paypal/return", paypalReturnHandler);
router.get("/paypal/cancel", paypalCancelHandler);
router.post("/paypal/webhook", paypalWebhookHandler);

// Stripe
router.post("/stripe/create-intent", requireRoles("customer", "admin"), createStripeIntentHandler);
router.post("/stripe/webhook", stripeWebhookHandler);

// TEST ONLY - Manually trigger payment success (disable in production)
if (process.env.NODE_ENV !== 'production') {
  router.post("/stripe/test-payment-success", requireRoles("admin"), testStripePaymentSuccessHandler);
}

// COD & VietQR
router.post("/cod/create", requireRoles("customer", "admin"), createCodHandler);
router.get("/cod/create", requireRoles("customer", "admin"), createCodHandler);
router.post("/vietqr/webhook", vietqrWebhookHandler);
router.post("/vietqr/create", requireRoles("customer", "admin"), createVietqrHandler);
router.get("/vietqr/create", requireRoles("customer", "admin"), createVietqrHandler);
router.post("/vietqr/confirm", requireRoles("customer", "admin"), confirmVietqrHandler);
router.post("/vietqr/cancel", requireRoles("customer", "admin"), cancelVietqrHandler);
router.post("/vietqr/query", requireRoles("customer", "admin"), queryVietqrHandler);

export default router;
