import express from "express";
import {
  staffDashboardHandler,
  staffOrdersHandler,
  staffUpdateOrderStatusHandler,
  staffToggleProductHandler,
  staffSupportMessagesHandler,
  staffSupportMetricsHandler,
  staffReplySupportHandler,
  staffInventoryHandler,
  staffUpdateInventoryHandler,
  staffPerformanceHandler,
  staffShiftsHandler,
  staffCheckInHandler,
  staffCheckOutHandler,
  staffBreakHandler,
  staffStationTasksHandler,
  staffStationLoadHandler,
  staffStationTaskStatusHandler,
  staffPackingBoardHandler
} from "./staff.api.controller.js";
import { requireRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireRoles("staff", "admin"));

router.get("/dashboard", staffDashboardHandler);
router.get("/orders", staffOrdersHandler);
router.patch("/orders/:orderId/status", staffUpdateOrderStatusHandler);
router.post("/menu/:productId/toggle", staffToggleProductHandler);
router.get("/support/messages", staffSupportMessagesHandler);
router.get("/support/metrics", staffSupportMetricsHandler);
router.post("/support/:messageId/reply", staffReplySupportHandler);
router.get("/inventory", staffInventoryHandler);
router.post("/inventory", staffUpdateInventoryHandler);
router.get("/performance", staffPerformanceHandler);
router.get("/shifts", staffShiftsHandler);
router.post("/timeclock/check-in", staffCheckInHandler);
router.post("/timeclock/check-out", staffCheckOutHandler);
router.post("/timeclock/break", staffBreakHandler);
router.get("/kds/stations/:stationCode/tasks", staffStationTasksHandler);
router.get("/kds/stations/:stationCode/load", staffStationLoadHandler);
router.post("/kds/stations/:stationCode/tasks/:taskId/status", staffStationTaskStatusHandler);
router.get("/kds/packing-board", staffPackingBoardHandler);

export default router;
