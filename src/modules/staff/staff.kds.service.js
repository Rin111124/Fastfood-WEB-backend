"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";
import { StaffServiceError } from "./staff.service.js";
import { sanitizeStationCode } from "../order/stationTask.helper.js";
import { emitToStaff } from "../../realtime/io.js";

const {
  StaffTimeClockEntry,
  StationTask,
  KitchenStation,
  Order,
  OrderItem,
  Product,
  User,
  sequelize
} = db;

const ACTIVE_TASK_STATUSES = ["pending", "acknowledged", "in_progress"];
const COMPLETED_OR_NEUTRAL_STATUSES = ["completed", "canceled"];

class StaffKdsServiceError extends StaffServiceError {}

const ensureStationRecord = async (code) => {
  const normalized = sanitizeStationCode(code);
  if (!normalized) return null;
  let station = await KitchenStation.findOne({ where: { code: normalized }, paranoid: false });
  if (!station) {
    station = await KitchenStation.create({
      code: normalized,
      name: normalized.toUpperCase(),
      station_type: "custom",
      description: "Auto created via timeclock",
      is_active: true,
      is_pack_station: normalized === "pack",
      display_order: 99
    });
  }
  return station;
};

const getActiveTimeclockEntry = async (staffId) =>
  StaffTimeClockEntry.findOne({
    where: { staff_id: staffId, check_out_time: { [Op.is]: null } },
    order: [["created_at", "DESC"]]
  });

const checkInStaff = async (staffId, payload = {}) => {
  const existing = await getActiveTimeclockEntry(staffId);
  if (existing) {
    throw new StaffKdsServiceError("Ban dang o trang thai dang lam viec", { clock_id: existing.clock_id });
  }
  const station = await ensureStationRecord(payload.stationCode || payload.station_code);
  const entry = await StaffTimeClockEntry.create({
    staff_id: staffId,
    shift_id: payload.shift_id || payload.shiftId || null,
    station_code: station ? station.code : null,
    status: "on_duty",
    check_in_time: new Date(),
    metadata: payload.metadata || null
  });
  const plain = entry.get({ plain: true });
  emitToStaff("staff:timeclock", { type: "check-in", staff_id: staffId, station_code: plain.station_code });
  return plain;
};

const hasOtherOnDutyStaffForStation = async (stationCode, staffId) => {
  if (!stationCode) return false;
  const count = await StaffTimeClockEntry.count({
    where: {
      station_code: stationCode,
      staff_id: { [Op.ne]: staffId },
      status: "on_duty",
      check_out_time: { [Op.is]: null }
    }
  });
  return count > 0;
};

const hasBlockingTasksForStation = async (stationCode) => {
  if (!stationCode) return false;
  const pendingCount = await StationTask.count({
    where: {
      station_code: stationCode,
      status: { [Op.in]: ACTIVE_TASK_STATUSES }
    }
  });
  return pendingCount > 0;
};

const checkOutStaff = async (staffId) => {
  const entry = await getActiveTimeclockEntry(staffId);
  if (!entry) {
    throw new StaffKdsServiceError("Ban khong co ca dang lam viec");
  }
  const stationCode = entry.station_code;
  if (await hasBlockingTasksForStation(stationCode)) {
    const hasBackup = await hasOtherOnDutyStaffForStation(stationCode, staffId);
    if (!hasBackup) {
      throw new StaffKdsServiceError("Con mon dang cho tai tram cua ban. Vui long chuyen giao truoc khi checkout.", {
        stationCode
      });
    }
  }
  await entry.update({
    status: "off_duty",
    check_out_time: new Date(),
    break_started_at: null
  });
  const plain = entry.get({ plain: true });
  emitToStaff("staff:timeclock", { type: "check-out", staff_id: staffId, station_code: plain.station_code });
  return plain;
};

const setStaffBreakStatus = async (staffId, action = "start") => {
  const entry = await getActiveTimeclockEntry(staffId);
  if (!entry) {
    throw new StaffKdsServiceError("Khong tim thay ca dang lam viec");
  }
  if (action === "start") {
    if (entry.status === "on_break") {
      return entry.get({ plain: true });
    }
    if (await hasBlockingTasksForStation(entry.station_code)) {
      const hasBackup = await hasOtherOnDutyStaffForStation(entry.station_code, staffId);
      if (!hasBackup) {
        throw new StaffKdsServiceError("Tram dang co mon cho xu ly, khong the nghi tiep.", {
          stationCode: entry.station_code
        });
      }
    }
    await entry.update({
      status: "on_break",
      break_started_at: new Date()
    });
  } else {
    await entry.update({
      status: "on_duty",
      break_started_at: null
    });
  }
  const plain = entry.get({ plain: true });
  emitToStaff("staff:timeclock", { type: "break", staff_id: staffId, station_code: plain.station_code, status: action });
  return plain;
};

const formatTaskPlain = (task) => {
  const plain = task.get({ plain: true });
  const productName = plain.orderItem?.Product?.name || "Mon";
  const orderCode = `#${String(plain.order_id).padStart(4, "0")}`;
  const waitingSeconds = Math.max(0, Math.round((Date.now() - new Date(plain.created_at).getTime()) / 1000));
  return {
    ...plain,
    order_code: orderCode,
    product_name: productName,
    waiting_seconds: waitingSeconds,
    order_status: plain.Order?.status || null,
    customer_name: plain.Order?.User?.full_name || plain.Order?.User?.username || null
  };
};

const listStationTasks = async (stationCode, { includeCompletedWindowMinutes = 5, limit = 50 } = {}) => {
  const normalized = sanitizeStationCode(stationCode);
  if (!normalized) {
    throw new StaffKdsServiceError("Ma tram khong hop le", { stationCode });
  }
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 200)) : 50;
  const where = { station_code: normalized };
  const orConditions = [{ status: { [Op.in]: ACTIVE_TASK_STATUSES } }];
  if (includeCompletedWindowMinutes > 0) {
    const threshold = new Date(Date.now() - includeCompletedWindowMinutes * 60 * 1000);
    orConditions.push({
      status: "completed",
      updated_at: { [Op.gte]: threshold }
    });
  }
  where[Op.or] = orConditions;

  const tasks = await StationTask.findAll({
    where,
    include: [
      {
        model: Order,
        include: [{ model: User, attributes: ["user_id", "full_name", "username"] }]
      },
      {
        model: OrderItem,
        as: "orderItem",
        include: [{ model: Product, attributes: ["product_id", "name"] }]
      }
    ],
    order: [
      ["status", "ASC"],
      ["created_at", "ASC"]
    ],
    limit: safeLimit
  });

  return tasks.map(formatTaskPlain);
};

const syncPackingReadinessForOrder = async (orderId, { transaction } = {}) => {
  const total = await StationTask.count({ where: { order_id: orderId }, transaction });
  if (!total) {
    return { total: 0, completed: 0, ready: false };
  }
  const remaining = await StationTask.count({
    where: {
      order_id: orderId,
      status: { [Op.notIn]: COMPLETED_OR_NEUTRAL_STATUSES }
    },
    transaction
  });
  return {
    total,
    completed: total - remaining,
    ready: remaining === 0
  };
};

const updateStationTaskStatus = async (taskId, status, staffId) => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (!["acknowledged", "in_progress", "completed", "canceled"].includes(normalizedStatus)) {
    throw new StaffKdsServiceError("Trang thai khong hop le", { status });
  }

  let updatedTask;
  await sequelize.transaction(async (transaction) => {
    const task = await StationTask.findByPk(taskId, {
      include: [{ model: Order }],
      transaction
    });
    if (!task) {
      throw new StaffKdsServiceError("Khong tim thay task", { taskId });
    }
    if (task.status === "completed" && normalizedStatus !== "canceled") {
      updatedTask = task;
      return;
    }
    const updates = {};
    const now = new Date();
    switch (normalizedStatus) {
      case "acknowledged":
        if (!task.acknowledged_at) {
          updates.acknowledged_at = now;
          updates.acknowledged_by = staffId;
        }
        updates.status = "acknowledged";
        break;
      case "in_progress":
        updates.status = "in_progress";
        if (!task.started_at) {
          updates.started_at = now;
        }
        break;
      case "completed":
        updates.status = "completed";
        updates.completed_at = now;
        updates.completed_by = staffId;
        if (!task.started_at) {
          updates.started_at = now;
        }
        break;
      case "canceled":
        updates.status = "canceled";
        updates.completed_at = now;
        updates.completed_by = staffId;
        break;
      default:
        break;
    }
    await task.update(updates, { transaction });
    updatedTask = task;
    await syncPackingReadinessForOrder(task.order_id, { transaction });
  });

  if (updatedTask) {
    emitToStaff("kds:tasks:updated", {
      task_id: updatedTask.task_id,
      order_id: updatedTask.order_id,
      station_code: updatedTask.station_code,
      status: updatedTask.status
    });
  }

  return formatTaskPlain(await StationTask.findByPk(taskId, {
    include: [
      {
        model: Order,
        include: [{ model: User, attributes: ["user_id", "full_name", "username"] }]
      },
      {
        model: OrderItem,
        as: "orderItem",
        include: [{ model: Product, attributes: ["product_id", "name"] }]
      }
    ]
  }));
};

const listPackingBoard = async ({ limitOrders = 20 } = {}) => {
  const tasks = await StationTask.findAll({
    where: { status: { [Op.not]: "canceled" } },
    include: [
      {
        model: Order,
        include: [{ model: User, attributes: ["user_id", "full_name", "username"] }]
      },
      {
        model: OrderItem,
        as: "orderItem",
        include: [{ model: Product, attributes: ["product_id", "name"] }]
      }
    ],
    order: [
      ["order_id", "ASC"],
      ["created_at", "ASC"]
    ]
  });

  const orderMap = new Map();
  tasks.forEach((task) => {
    const formatted = formatTaskPlain(task);
    const bucket =
      orderMap.get(task.order_id) ||
      {
        order_id: task.order_id,
        order_code: `#${String(task.order_id).padStart(4, "0")}`,
        order_status: task.Order?.status || null,
        customer_name: task.Order?.User?.full_name || task.Order?.User?.username || "Khach",
        tasks: []
      };
    bucket.tasks.push(formatted);
    orderMap.set(task.order_id, bucket);
  });

  const packed = Array.from(orderMap.values())
    .map((entry) => {
      const total = entry.tasks.length;
      const completed = entry.tasks.filter((task) => task.status === "completed").length;
      const awaitingStations = [
        ...new Set(entry.tasks.filter((task) => task.status !== "completed").map((task) => task.station_code))
      ];
      return {
        ...entry,
        total_tasks: total,
        completed_tasks: completed,
        progress: total ? Math.round((completed / total) * 100) : 0,
        awaitingStations,
        is_ready_for_pack: awaitingStations.length === 0
      };
    })
    .sort((a, b) => a.order_id - b.order_id)
    .slice(0, limitOrders);

  return packed;
};

const getStationLoadSnapshot = async (stationCode) => {
  const normalized = sanitizeStationCode(stationCode);
  if (!normalized) {
    throw new StaffKdsServiceError("Ma tram khong hop le", { stationCode });
  }
  const station = await KitchenStation.findOne({ where: { code: normalized }, paranoid: false });
  const [pending, inProgress, total] = await Promise.all([
    StationTask.count({ where: { station_code: normalized, status: { [Op.in]: ["pending", "acknowledged"] } } }),
    StationTask.count({ where: { station_code: normalized, status: "in_progress" } }),
    StationTask.count({ where: { station_code: normalized, status: { [Op.not]: "canceled" } } })
  ]);
  const oldest = await StationTask.findOne({
    where: {
      station_code: normalized,
      status: { [Op.in]: ACTIVE_TASK_STATUSES }
    },
    order: [["created_at", "ASC"]],
    attributes: ["created_at"]
  });
  const overloadThreshold = station?.capacity_per_batch ? station.capacity_per_batch * 2 : 6;
  return {
    station_code: normalized,
    station_name: station?.name || normalized.toUpperCase(),
    pending,
    in_progress: inProgress,
    total,
    oldest_wait_seconds: oldest ? Math.max(0, Math.round((Date.now() - new Date(oldest.created_at)) / 1000)) : 0,
    capacity: station?.capacity_per_batch || null,
    overloaded: pending >= overloadThreshold
  };
};

export {
  StaffKdsServiceError,
  checkInStaff,
  checkOutStaff,
  setStaffBreakStatus,
  listStationTasks,
  updateStationTaskStatus,
  listPackingBoard,
  getStationLoadSnapshot
};
