"use strict";

import { clearCart } from "../customer/customer.service.js";
import { logAction } from "../admin/admin.service.js";
import { assignOrderToOnDutyStaff } from "./orderAssignment.helper.js";
import { ensureStationTasksForOrder } from "./stationTask.helper.js";
import { emitToStaff } from "../../realtime/io.js";

const clearCustomerCart = async (userId) => {
  if (!userId) return null;
  try {
    return await clearCart(userId);
  } catch (error) {
    console.error("Failed to clear cart after payment:", error);
    return null;
  }
};

const recordPaymentActivity = async (order, provider, metadata = {}) => {
  if (!order) return null;
  try {
    await logAction(order.user_id || null, "PAYMENT_CONFIRMED", "orders", {
      orderId: order.order_id,
      provider,
      ...metadata
    });
  } catch (error) {
    console.error("Failed to log payment activity:", error);
  }
};

const prepareOrderForFulfillment = async (order, options = {}) => {
  if (!order) return { staffId: null, tasks: [] };
  const transaction = options.transaction;

  console.log(`📋 prepareOrderForFulfillment - Order #${order.order_id}, Status: ${order.status}`);

  // Only prepare orders that are paid or confirmed (COD)
  // Skip pending orders (waiting for payment)
  if (!["paid", "confirmed"].includes(order.status)) {
    console.log(`⏸️  Skipping order #${order.order_id} - Status not ready (${order.status})`);
    return { staffId: null, tasks: [] };
  }

  // Change status to preparing
  order.status = "preparing";
  await order.save({ transaction });
  console.log(`✅ Order #${order.order_id} status changed to: preparing`);

  const staffId = await assignOrderToOnDutyStaff(order, {
    transaction,
    stationCode: options.stationCode
  });
  console.log(`👤 Assigned to staff ID: ${staffId}`);

  const tasks = await ensureStationTasksForOrder(order, { transaction });
  console.log(`📝 Created ${tasks?.length || 0} station tasks`);

  // Notify assigned staff specifically
  if (staffId) {
    const payload = {
      order_id: order.order_id,
      staff_id: staffId,
      total_amount: order.total_amount,
      status: order.status
    };
    console.log(`📤 Emitting "order:assigned" to staff ${staffId}:`, payload);
    emitToStaff("order:assigned", payload, staffId);
  }

  // Broadcast to all stations (for KDS)
  if (tasks?.length) {
    const stationCodes = [...new Set(tasks.map((task) => task.station_code))];
    const payload = {
      order_id: order.order_id,
      station_codes: stationCodes,
      assigned_staff_id: staffId
    };
    console.log(`📡 Broadcasting "kds:tasks:created":`, payload);
    emitToStaff("kds:tasks:created", payload);
  }

  return { staffId, tasks };
};

export { assignOrderToOnDutyStaff, clearCustomerCart, recordPaymentActivity, prepareOrderForFulfillment, ensureStationTasksForOrder };
