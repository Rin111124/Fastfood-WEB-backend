"use strict";

import express from "express";
import { ensureStaff } from "../../middleware/sessionAuth.js";
import {
  staffDashboardPage,
  staffOrdersPage,
  updateStaffOrderStatusHandler,
  staffMenuPage,
  toggleProductStatusHandler,
  staffSupportPage,
  replySupportHandler,
  staffInventoryPage,
  updateInventoryHandler,
  staffPerformancePage,
  staffShiftsPage
} from "./staff.web.controller.js";

const router = express.Router();

router.use(ensureStaff);

router.get("/", staffDashboardPage);

router.get("/orders", staffOrdersPage);
router.post("/orders/:orderId/status", updateStaffOrderStatusHandler);

router.get("/menu", staffMenuPage);
router.post("/menu/:productId/toggle", toggleProductStatusHandler);

router.get("/support", staffSupportPage);
router.post("/support/:messageId/reply", replySupportHandler);

router.get("/inventory", staffInventoryPage);
router.post("/inventory", updateInventoryHandler);

router.get("/performance", staffPerformancePage);

router.get("/shifts", staffShiftsPage);

const initStaffRoutes = (app) => app.use("/staff", router);

export default initStaffRoutes;
