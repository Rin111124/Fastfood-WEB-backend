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

const initApiRoutes = (app) => app.use("/api", router);

export default initApiRoutes;
