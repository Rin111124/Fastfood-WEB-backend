"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";
import { sanitizeStationCode } from "./stationTask.helper.js";

const { StaffShift, StaffTimeClockEntry, User } = db;

const formatIsoDate = (date = new Date()) => date.toISOString().slice(0, 10);
const formatIsoTime = (date = new Date()) => date.toTimeString().slice(0, 8);

const findActiveTimeClockEntry = async ({ stationCode, transaction } = {}) => {
  const baseWhere = {
    status: "on_duty",
    check_out_time: { [Op.is]: null }
  };
  const normalizedStation = sanitizeStationCode(stationCode);
  const makeQuery = (extraWhere = {}) => ({
    where: { ...baseWhere, ...extraWhere },
    order: [
      ["station_code", "ASC"],
      ["check_in_time", "ASC"]
    ],
    transaction
  });

  if (normalizedStation) {
    const entry = await StaffTimeClockEntry.findOne(
      makeQuery({ station_code: normalizedStation })
    );
    if (entry) return entry;
  }

  return StaffTimeClockEntry.findOne(makeQuery());
};

const findOnDutyStaffShift = async (options = {}) => {
  const now = new Date();
  const currentTime = formatIsoTime(now);
  const where = {
    shift_date: formatIsoDate(now),
    status: "scheduled"
  };

  // Find shifts where current time is within start_time and end_time
  const shift = await StaffShift.findOne({
    where,
    order: [["start_time", "ASC"]],
    transaction: options.transaction
  });

  // Filter manually for MySQL TIME comparison safety
  if (shift && shift.start_time <= currentTime && shift.end_time >= currentTime) {
    return shift;
  }

  return null;
};

const assignOrderToOnDutyStaff = async (order, options = {}) => {
  if (!order || order.assigned_staff_id) return null;
  const transaction = options.transaction;
  const activeEntry = await findActiveTimeClockEntry({ stationCode: options.stationCode, transaction });
  let staffId = activeEntry?.staff_id;
  if (!staffId) {
    const shift = await findOnDutyStaffShift({ transaction });
    staffId = shift?.staff_id;
  }
  if (!staffId) {
    // Find any active staff member as fallback (randomly to distribute load)
    const fallback = await User.findOne({
      where: {
        role: "staff",
        status: "active"
      },
      attributes: ["user_id"],
      order: [
        [db.sequelize.fn('RAND')],  // Random for load distribution
        ["user_id", "ASC"]
      ],
      transaction
    });
    staffId = fallback?.user_id || null;
  }
  if (!staffId) {
    console.warn(`[OrderAssignment] No staff available to assign order ${order.order_id}`);
    return null;
  }

  // Verify staff exists and is active before assigning
  const staffUser = await User.findOne({
    where: {
      user_id: staffId,
      role: { [Op.in]: ["staff", "admin"] },
      status: "active"
    },
    attributes: ["user_id", "username", "full_name"],
    transaction
  });

  if (!staffUser) {
    console.warn(`[OrderAssignment] Staff ${staffId} not found or inactive for order ${order.order_id}`);
    return null;
  }

  order.assigned_staff_id = staffId;
  await order.save({ transaction });
  console.log(`[OrderAssignment] Order ${order.order_id} assigned to staff ${staffUser.username} (${staffUser.full_name})`);
  return staffId;
};

export { assignOrderToOnDutyStaff, findOnDutyStaffShift, findActiveTimeClockEntry };
