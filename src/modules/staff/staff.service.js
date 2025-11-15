"use strict";

import db from "../../models/index.js";
import { AdminServiceError, toggleProductAvailability, listInventory, upsertInventoryItem, listStaffShifts } from "../admin/admin.service.js";
import { ensureProductImageColumns } from "../../utils/schemaEnsurer.js";
import { mapImageFields } from "../../utils/imageMapper.js";

const {
  User,
  Order,
  OrderItem,
  Product,
  Message,
  StaffShift,
  Conversation,
  ChatMessage
} = db;

class StaffServiceError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = "StaffServiceError";
    this.metadata = metadata;
  }
}

const ensureStaffUser = async (staffId) => {
  const user = await User.findByPk(staffId, { paranoid: false });
  if (!user || !["staff", "shipper"].includes(user.role)) {
    throw new StaffServiceError("Nhan vien khong hop le", { staffId });
  }
  return user;
};

const mapProductImage = (product) => {
  if (!product) return product;
  const plain = product?.get ? product.get({ plain: true }) : product;
  return mapImageFields(plain);
};

const resolveProductImageAttributes = (supportsBlob) => {
  const attrs = ["product_id", "name", "price", "image_url", "food_type"];
  if (supportsBlob) {
    attrs.splice(3, 0, "image_data", "image_mime");
  }
  return attrs;
};

const getStaffDashboard = async (staffId) => {
  await ensureStaffUser(staffId);

  const [assigned, completed, canceled, upcomingShiftsRaw] = await Promise.all([
    Order.count({ where: { assigned_staff_id: staffId } }),
    Order.count({ where: { assigned_staff_id: staffId, status: "completed" } }),
    Order.count({ where: { assigned_staff_id: staffId, status: "canceled" } }),
    StaffShift.findAll({
      where: { staff_id: staffId },
      order: [["shift_date", "ASC"]],
      limit: 5
    })
  ]);

  const upcomingShifts = upcomingShiftsRaw.map((shift) => shift.get({ plain: true }));

  return {
    assigned,
    completed,
    canceled,
    upcomingShifts
  };
};

const listAssignedOrders = async (staffId, { status } = {}) => {
  await ensureStaffUser(staffId);
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const productImageAttributes = resolveProductImageAttributes(supportsBlob);
  const where = { assigned_staff_id: staffId };
  if (status && status !== "all") {
    where.status = status;
  }
  const orders = await Order.findAll({
    where,
    include: [
      { model: User, attributes: ["user_id", "username", "full_name"] },
      {
        model: OrderItem,
        include: [
          {
            model: Product,
            attributes: productImageAttributes
          }
        ]
      }
    ],
    order: [["created_at", "DESC"]]
  });

  return orders.map((order) => {
    const plain = order.get({ plain: true });
    if (Array.isArray(plain.OrderItems)) {
      plain.items = plain.OrderItems.map((item) => ({
        ...item,
        Product: item.Product ? mapProductImage(item.Product) : null
      }));
    } else {
      plain.items = [];
    }
    delete plain.OrderItems;
    const itemsSubtotal = plain.items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    plain.items_subtotal = Number(itemsSubtotal.toFixed(2));
    return plain;
  });
};

const updateAssignedOrderStatus = async (staffId, orderId, status) => {
  await ensureStaffUser(staffId);
  const order = await Order.findOne({ where: { order_id: orderId, assigned_staff_id: staffId } });
  if (!order) {
    throw new StaffServiceError("Ban khong duoc phep cap nhat don hang nay", { orderId });
  }
  order.status = status;
  await order.save();
  return order.get({ plain: true });
};

const toggleProductStatus = async (staffId, productId) => {
  await ensureStaffUser(staffId);
  return toggleProductAvailability(productId, staffId);
};

const listSupportMessages = async () => {
  const messages = await Message.findAll({
    include: [{ model: User, attributes: ["user_id", "username", "full_name"] }],
    order: [["created_at", "DESC"]],
    paranoid: false
  });
  return messages.map((msg) => msg.get({ plain: true }));
};

const getSupportMetrics = async () => {
  const unrepliedCount = await Message.count({ where: { reply: null } });
  return { unrepliedCount };
};

const replySupportMessage = async (messageId, staffId, reply) => {
  await ensureStaffUser(staffId);
  const message = await Message.findByPk(messageId, { paranoid: false });
  if (!message) {
    throw new StaffServiceError("Khong tim thay tin nhan", { messageId });
  }
  message.reply = reply;
  message.from_role = "staff";
  await message.save();
  // Append to conversation history as multi-turn
  if (message.user_id) {
    try {
      let convo = await Conversation.findOne({ where: { user_id: message.user_id, status: 'open' } });
      if (!convo) {
        convo = await Conversation.create({ user_id: message.user_id, status: 'open', last_message_at: new Date() });
      }
      await ChatMessage.create({ conversation_id: convo.conversation_id, sender_role: 'staff', body: String(reply || '') });
      await convo.update({ last_message_at: new Date() });
    } catch (error) {
      // If conversation tables missing, ignore silently
    }
  }
  return message.get({ plain: true });
};

const listInventoryItems = async () => {
  const items = await listInventory();
  return items.map((item) => item.get ? item.get({ plain: true }) : item);
};

const updateInventoryFromStaff = async (payload, staffId) => {
  await ensureStaffUser(staffId);
  return upsertInventoryItem({ ...payload, updated_by: staffId }, staffId);
};

const getStaffPerformance = async (staffId) => {
  await ensureStaffUser(staffId);
  const [completedOrders, totalOrders] = await Promise.all([
    Order.count({ where: { assigned_staff_id: staffId, status: "completed" } }),
    Order.count({ where: { assigned_staff_id: staffId } })
  ]);

  const completionRate = totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0;

  return {
    completedOrders,
    totalOrders,
    completionRate,
    rating: "N/A"
  };
};

const listShiftsForStaff = async (staffId) => {
  await ensureStaffUser(staffId);
  const all = await listStaffShifts();
  return all.filter((shift) => shift.staff_id === staffId).map((shift) => shift.get({ plain: true }));
};

export {
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
};
