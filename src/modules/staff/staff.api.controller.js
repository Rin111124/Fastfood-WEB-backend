import {
  StaffServiceError,
  getStaffDashboard,
  listAssignedOrders,
  updateAssignedOrderStatus,
  toggleProductStatus,
  listSupportMessages,
  getSupportMetrics,
  replySupportMessage,
  listInventoryItems,
  updateInventoryFromStaff,
  getStaffPerformance,
  listShiftsForStaff
} from "./staff.service.js";
import {
  checkInStaff,
  checkOutStaff,
  setStaffBreakStatus,
  listStationTasks,
  updateStationTaskStatus,
  listPackingBoard,
  getStationLoadSnapshot
} from "./staff.kds.service.js";
import db from "../../models/index.js";
import { emitToUser as emitToUserRealtime } from "../../realtime/io.js";

const { User } = db;

const toPlain = (item) => (item?.get ? item.get({ plain: true }) : item);
const toPlainList = (list = []) => list.map(toPlain);

const resolveStaffId = async (req) => {
  const authRole = req?.auth?.role;
  if (authRole === "staff" || authRole === "shipper") {
    return Number(req.auth.user_id);
  }
  if (authRole === "admin" && req.query?.staffId) {
    return Number(req.query.staffId);
  }
  if (req?.session?.user?.role === "staff") {
    return Number(req.session.user.user_id);
  }
  if (req.body?.staffId) {
    return Number(req.body.staffId);
  }
  if (req.query?.staffId) {
    return Number(req.query.staffId);
  }
  const staff = await User.findOne({ where: { role: "staff" }, attributes: ["user_id"] });
  return staff ? staff.user_id : null;
};

const handleError = (res, error) => {
  if (error instanceof StaffServiceError) {
    return res.status(400).json({ success: false, message: error.message, detail: error.metadata });
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const safeMessage =
    typeof error?.message === "string" && error.message.trim().length
      ? error.message
      : "Co loi xay ra, vui long thu lai sau.";

  console.error("Staff API error", error);

  const payload = {
    success: false,
    message: statusCode >= 500 ? "May chu dang gap su co, vui long thu lai sau." : safeMessage
  };

  if (process.env.NODE_ENV === "development") {
    payload.detail = {
      message: safeMessage,
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.stack ? { stack: error.stack.split("\n").slice(0, 3) } : {})
    };
  }

  return res.status(statusCode).json(payload);
};

const staffDashboardHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const dashboard = await getStaffDashboard(staffId);
    return res.json({ success: true, data: dashboard });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffOrdersHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const orders = await listAssignedOrders(staffId, { status: req.query.status });
    return res.json({ success: true, data: toPlainList(orders) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffUpdateOrderStatusHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const order = await updateAssignedOrderStatus(staffId, req.params.orderId, req.body?.status);
    return res.json({ success: true, data: toPlain(order) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffToggleProductHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const product = await toggleProductStatus(staffId, req.params.productId);
    return res.json({ success: true, data: toPlain(product) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffSupportMessagesHandler = async (req, res) => {
  try {
    const messages = await listSupportMessages();
    return res.json({ success: true, data: toPlainList(messages) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffSupportMetricsHandler = async (req, res) => {
  try {
    const metrics = await getSupportMetrics();
    return res.json({ success: true, data: metrics });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffReplySupportHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const message = await replySupportMessage(req.params.messageId, staffId, req.body?.reply);
    const plain = toPlain(message);
    // Notify the original user if available
    if (plain?.user_id) {
      emitToUserRealtime(plain.user_id, 'support:replied', plain);
    }
    return res.json({ success: true, data: plain });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffInventoryHandler = async (req, res) => {
  try {
    const items = await listInventoryItems();
    return res.json({ success: true, data: toPlainList(items) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffUpdateInventoryHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const item = await updateInventoryFromStaff(req.body || {}, staffId);
    return res.json({ success: true, data: toPlain(item) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffPerformanceHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const performance = await getStaffPerformance(staffId);
    return res.json({ success: true, data: performance });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffShiftsHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const shifts = await listShiftsForStaff(staffId);
    return res.json({ success: true, data: toPlainList(shifts) });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffCheckInHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const entry = await checkInStaff(staffId, req.body || {});
    return res.json({ success: true, data: entry });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffCheckOutHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const entry = await checkOutStaff(staffId);
    return res.json({ success: true, data: entry });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffBreakHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const action = typeof req.body?.action === "string" ? req.body.action.toLowerCase() : "start";
    const entry = await setStaffBreakStatus(staffId, action === "end" ? "end" : "start");
    return res.json({ success: true, data: entry });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffStationTasksHandler = async (req, res) => {
  try {
    const tasks = await listStationTasks(req.params.stationCode, {
      includeCompletedWindowMinutes: req.query.includeCompletedMinutes
        ? Number(req.query.includeCompletedMinutes)
        : 5,
      limit: req.query.limit ? Number(req.query.limit) : 50
    });
    const load = await getStationLoadSnapshot(req.params.stationCode);
    return res.json({ success: true, data: { tasks, load } });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffStationLoadHandler = async (req, res) => {
  try {
    const load = await getStationLoadSnapshot(req.params.stationCode);
    return res.json({ success: true, data: load });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffStationTaskStatusHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    if (!staffId) {
      return res.status(404).json({ success: false, message: "Khong tim thay nhan vien phu hop" });
    }
    const taskId = Number(req.params.taskId);
    const updated = await updateStationTaskStatus(taskId, req.body?.status, staffId);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffPackingBoardHandler = async (req, res) => {
  try {
    const limitOrders = req.query.limit ? Number(req.query.limit) : 20;
    const board = await listPackingBoard({ limitOrders });
    return res.json({ success: true, data: board });
  } catch (error) {
    return handleError(res, error);
  }
};

export {
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
};


