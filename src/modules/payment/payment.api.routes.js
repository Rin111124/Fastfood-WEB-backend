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
import { validateBody, validateQuery } from "../../middleware/validate.js";
import {
  orderIdOnlySchema,
  orderIdOrPayloadSchema,
  stripeTestSchema,
  vnpayStatusQuerySchema
} from "./payment.validation.js";
import { createAdminManualPaymentHandler, completeAdminManualPaymentHandler } from "./payment.api.controller.js";

const router = express.Router();

// Create payment URL (authenticated customer/admin)
router.post(
  "/vnpay/create",
  requireRoles("customer", "admin"),
  validateBody(orderIdOrPayloadSchema),
  createVnpayUrlHandler
);
router.get("/vnpay/create", requireRoles("customer", "admin"), createVnpayUrlHandler);
router.get("/vnpay/redirect", requireRoles("customer", "admin"), redirectToVnpayHandler);

// VNPAY return & IPN endpoints (public, called by VNPAY)
router.get("/vnpay/return", vnpayReturnHandler);
router.get("/vnpay/ipn", vnpayIpnHandler);

// Payment status (authenticated)
router.get(
  "/vnpay/status",
  requireRoles("customer", "admin"),
  validateQuery(vnpayStatusQuerySchema),
  getVnpayStatusHandler
);

// PayPal
router.post(
  "/paypal/create",
  requireRoles("customer", "admin"),
  validateBody(orderIdOrPayloadSchema),
  createPaypalOrderHandler
);
router.get("/paypal/create", requireRoles("customer", "admin"), createPaypalOrderHandler);
router.get("/paypal/return", paypalReturnHandler);
router.get("/paypal/cancel", paypalCancelHandler);
router.post("/paypal/webhook", paypalWebhookHandler);

// Stripe
router.post(
  "/stripe/create-intent",
  requireRoles("customer", "admin"),
  validateBody(orderIdOrPayloadSchema),
  createStripeIntentHandler
);
router.post("/stripe/webhook", stripeWebhookHandler);

// TEST ONLY - Manually trigger payment success (disable in production)
if (process.env.NODE_ENV !== 'production') {
  router.post(
    "/stripe/test-payment-success",
    requireRoles("admin"),
    validateBody(stripeTestSchema),
    testStripePaymentSuccessHandler
  );
}

// COD & VietQR
router.post(
  "/cod/create",
  requireRoles("customer", "admin"),
  validateBody(orderIdOrPayloadSchema),
  createCodHandler
);
router.get("/cod/create", requireRoles("customer", "admin"), createCodHandler);
router.post("/vietqr/webhook", vietqrWebhookHandler);
router.post(
  "/vietqr/create",
  requireRoles("customer", "admin"),
  validateBody(orderIdOrPayloadSchema),
  createVietqrHandler
);
router.get("/vietqr/create", requireRoles("customer", "admin"), createVietqrHandler);
router.post(
  "/vietqr/confirm",
  requireRoles("customer", "admin"),
  validateBody(orderIdOnlySchema),
  confirmVietqrHandler
);
router.post(
  "/vietqr/cancel",
  requireRoles("customer", "admin"),
  validateBody(orderIdOnlySchema),
  cancelVietqrHandler
);
router.post(
  "/vietqr/query",
  requireRoles("customer", "admin"),
  validateBody(orderIdOnlySchema),
  queryVietqrHandler
);

// Admin manual payment flow (create initiated, then mark success)
router.post("/admin/manual/initiate", requireRoles("admin"), createAdminManualPaymentHandler);
router.post("/admin/manual/complete", requireRoles("admin"), completeAdminManualPaymentHandler);

export default router;
