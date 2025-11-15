"use strict";

import {
  StaffServiceError,
  getStaffDashboard,
  listAssignedOrders,
  updateAssignedOrderStatus,
  toggleProductStatus,
  listSupportMessages,
  replySupportMessage,
  listInventoryItems,
  updateInventoryFromStaff,
  getStaffPerformance,
  listShiftsForStaff
} from "./staff.service.js";
import db from "../../models/index.js";

const { User, Product } = db;

const resolveStaffId = async (req) => {
  const sessionUser = req.session?.user;
  if (sessionUser?.role === "staff") {
    return Number(sessionUser.user_id);
  }
  if (req.user?.user_id) {
    return req.user.user_id;
  }
  if (req.query.staffId) {
    return Number(req.query.staffId);
  }
  if (req.body?.staffId) {
    return Number(req.body.staffId);
  }
  const staff = await User.findOne({ where: { role: "staff" }, attributes: ["user_id"] });
  return staff ? staff.user_id : null;
};

const safeStaffError = (error) => {
  if (error instanceof StaffServiceError) {
    return error.message;
  }
  return "Khong the thuc hien thao tac, vui long thu lai";
};

const toPlain = (item) => (item?.get ? item.get({ plain: true }) : item);

const toPlainList = (items = []) => items.map(toPlain);

const staffDashboardPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    if (!staffId) {
      return res.render("staff/dashboard", {
        staffId: null,
        staffList,
        dashboard: null,
        error: "Chua co nhan vien nao duoc tao",
        activeMenu: "dashboard",
        title: "Tổng quan"
      });
    }
    const dashboard = await getStaffDashboard(staffId);
    return res.render("staff/dashboard", {
      staffId,
      staffList,
      dashboard,
      activeMenu: "dashboard",
      title: "Tổng quan"
    });
  } catch (error) {
    return res.render("staff/dashboard", {
      staffId: null,
      staffList: [],
      dashboard: null,
      error: safeStaffError(error),
      activeMenu: "dashboard",
      title: "Tổng quan"
    });
  }
};

const staffOrdersPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const filter = req.query.filter || "all";
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    if (!staffId) {
      return res.render("staff/orders", {
        staffId: null,
        staffList,
        filter,
        orders: [],
        statusMessage: "Chua co nhan vien nao duoc tao",
        statusType: "info",
        activeMenu: "orders",
        title: "Đơn hàng của tôi"
      });
    }
    const orders = await listAssignedOrders(staffId, { status: filter });
    return res.render("staff/orders", {
      staffId,
      staffList,
      filter,
      orders,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "orders",
      title: "Đơn hàng của tôi"
    });
  } catch (error) {
    return res.render("staff/orders", {
      staffId: null,
      staffList: [],
      filter: req.query.filter || "all",
      orders: [],
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "orders",
      title: "Đơn hàng của tôi"
    });
  }
};

const updateStaffOrderStatusHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    await updateAssignedOrderStatus(staffId, req.params.orderId, req.body.status);
    return res.redirect(`/staff/orders?staffId=${staffId}&status=success&message=Cap%20nhat%20don%20hang%20thanh%20cong`);
  } catch (error) {
    const staffId = req.query.staffId || req.body.staffId || "";
    return res.redirect(`/staff/orders?staffId=${staffId}&status=error&message=${encodeURIComponent(safeStaffError(error))}`);
  }
};

const staffMenuPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    const products = toPlainList(await Product.findAll({ paranoid: false, order: [["created_at", "DESC"]] }));
    return res.render("staff/menu", {
      staffId,
      staffList,
      products,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "menu",
      title: "Tình trạng món ăn"
    });
  } catch (error) {
    return res.render("staff/menu", {
      staffId: null,
      staffList: [],
      products: [],
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "menu",
      title: "Tình trạng món ăn"
    });
  }
};

const toggleProductStatusHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    await toggleProductStatus(staffId, req.params.productId);
    return res.redirect(`/staff/menu?staffId=${staffId}&status=success&message=Cap%20nhat%20trang%20thai%20mon%20an`);
  } catch (error) {
    const staffId = req.query.staffId || req.body.staffId || "";
    return res.redirect(`/staff/menu?staffId=${staffId}&status=error&message=${encodeURIComponent(safeStaffError(error))}`);
  }
};

const staffSupportPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    const messages = await listSupportMessages();
    return res.render("staff/support", {
      staffId,
      staffList,
      messages,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "support",
      title: "Hỗ trợ khách hàng"
    });
  } catch (error) {
    return res.render("staff/support", {
      staffId: null,
      staffList: [],
      messages: [],
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "support",
      title: "Hỗ trợ khách hàng"
    });
  }
};

const replySupportHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    await replySupportMessage(req.params.messageId, staffId, req.body.reply);
    return res.redirect(`/staff/support?staffId=${staffId}&status=success&message=Da%20phan%20hoi%20khach%20hang`);
  } catch (error) {
    const staffId = req.query.staffId || req.body.staffId || "";
    return res.redirect(`/staff/support?staffId=${staffId}&status=error&message=${encodeURIComponent(safeStaffError(error))}`);
  }
};

const staffInventoryPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    const items = await listInventoryItems();
    return res.render("staff/inventory", {
      staffId,
      staffList,
      items,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "inventory",
      title: "Tồn kho tại quầy"
    });
  } catch (error) {
    return res.render("staff/inventory", {
      staffId: null,
      staffList: [],
      items: [],
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "inventory",
      title: "Tồn kho tại quầy"
    });
  }
};

const updateInventoryHandler = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    await updateInventoryFromStaff(req.body, staffId);
    return res.redirect(`/staff/inventory?staffId=${staffId}&status=success&message=Cap%20nhat%20ton%20kho%20thanh%20cong`);
  } catch (error) {
    const staffId = req.query.staffId || req.body.staffId || "";
    return res.redirect(`/staff/inventory?staffId=${staffId}&status=error&message=${encodeURIComponent(safeStaffError(error))}`);
  }
};

const staffPerformancePage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    if (!staffId) {
      return res.render("staff/performance", {
        staffId: null,
        staffList,
        performance: null,
        statusMessage: "Chua co nhan vien nao duoc tao",
        statusType: "info",
        activeMenu: "performance",
        title: "Hiệu suất cá nhân"
      });
    }
    const performance = await getStaffPerformance(staffId);
    return res.render("staff/performance", {
      staffId,
      staffList,
      performance,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "performance",
      title: "Hiệu suất cá nhân"
    });
  } catch (error) {
    return res.render("staff/performance", {
      staffId: null,
      staffList: [],
      performance: null,
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "performance",
      title: "Hiệu suất cá nhân"
    });
  }
};

const staffShiftsPage = async (req, res) => {
  try {
    const staffId = await resolveStaffId(req);
    const staffList = toPlainList(await User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }));
    const shifts = staffId ? await listShiftsForStaff(staffId) : [];
    return res.render("staff/shifts", {
      staffId,
      staffList,
      shifts,
      statusMessage: req.query.message,
      statusType: req.query.status || "info",
      activeMenu: "shifts",
      title: "Lịch trực cá nhân"
    });
  } catch (error) {
    return res.render("staff/shifts", {
      staffId: null,
      staffList: [],
      shifts: [],
      statusMessage: safeStaffError(error),
      statusType: "error",
      activeMenu: "shifts",
      title: "Lịch trực cá nhân"
    });
  }
};

export {
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
};
