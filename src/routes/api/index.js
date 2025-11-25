import express from "express";
import authRoutes from "../../modules/auth/auth.api.routes.js";
import adminRoutes from "../../modules/admin/admin.api.routes.js";
import staffRoutes from "../../modules/staff/staff.api.routes.js";
import customerRoutes from "../../modules/customer/customer.api.routes.js";
import paymentRoutes from "../../modules/payment/payment.api.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/staff", staffRoutes);
router.use("/customer", customerRoutes);
router.use("/payments", paymentRoutes);

// Debug endpoint to verify gateway header without leaking header name/value.
router.get("/debug/headers", (req, res) => {
  const headerName = (process.env.GATEWAY_SHARED_HEADER || "x-gateway-secret").toLowerCase();
  const secret = process.env.GATEWAY_SHARED_SECRET;
  const received = req.headers[headerName];
  const revealDetails =
    (process.env.EXPOSE_GATEWAY_DEBUG_HEADERS || "").toLowerCase() === "true" &&
    (process.env.NODE_ENV || "development") === "development";

  const base = {
    path: req.originalUrl,
    method: req.method,
    clientIp: req.ip,
    userAgent: req.get("user-agent") || null,
    hasGatewayHeader: Boolean(received),
    gatewayHeaderMatches: secret ? received === secret : null
  };

  if (revealDetails) {
    base.gatewayHeaderName = headerName;
    base.gatewayHeaderLength = typeof received === "string" ? received.length : null;
  }

  res.json(base);
});

const initApiRoutes = (app) => app.use("/api", router);

export default initApiRoutes;
