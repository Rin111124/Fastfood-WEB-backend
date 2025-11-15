"use strict";

import {
  AdminServiceError,
  getDashboardMetrics,
  listUsers,
  createUser,
  updateUser,
  setUserStatus,
  deleteUser,
  restoreUser,
  resetUserPassword,
  sendPasswordResetEmail,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
  listProductOptions,
  createProductOption,
  updateProductOption,
  deleteProductOption,
  listOrders,
  assignOrder,
  updateOrderStatus,
  markOrderRefund,
  listPromotions,
  createPromotion,
  updatePromotion,
  togglePromotion,
  getReportOverview,
  listSystemSettings,
  upsertSystemSetting,
  listSystemLogs,
  listInventory,
  upsertInventoryItem,
  getBackupList,
  createBackup,
  restoreFromBackup,
  listStaffShifts,
  scheduleStaffShift
} from "./admin.service.js";
import db from "../../models/index.js";

const { User } = db;

const resolveActorId = (req) => {
  if (req?.session?.user?.user_id) {
    return Number(req.session.user.user_id);
  }
  return Number(req?.user?.user_id || req?.body?.actorId || req?.query?.actorId || 0) || null;
};

const buildRedirect = (base, params = {}) => {
  const search = new URLSearchParams(params);
  return search.toString() ? `${base}?${search.toString()}` : base;
};

const safeErrorMessage = (error) => {
  if (error instanceof AdminServiceError) {
    return error.message;
  }
  return "Da xay ra loi, vui long thu lai";
};

const toPlainList = (items = []) => items.map((item) => (item?.get ? item.get({ plain: true }) : item));

const renderAdminPage = (res, view, data = {}) => res.render(view, data);

const adminDashboardPage = async (req, res) => {
  try {
    const metrics = await getDashboardMetrics();
    return renderAdminPage(res, "admin/dashboard", {
      metrics,
      activeMenu: "dashboard",
      title: "Bảng điều khiển"
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

const adminUsersPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const users = toPlainList(await listUsers());
    return renderAdminPage(res, "admin/users", {
      users,
      statusMessage,
      statusType,
      activeMenu: "users",
      title: "Quản lý người dùng"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/users", {
      users: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "users",
      title: "Quản lý người dùng"
    });
  }
};

const createUserHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    const result = await createUser(req.body, actorId);
    const params = {
      status: "success",
      message: result.generatedPassword
        ? `Tao tai khoan thanh cong. Mat khau tam: ${result.generatedPassword}`
        : "Tao tai khoan thanh cong"
    };
    return res.redirect(buildRedirect("/admin/users", params));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updateUserHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updateUser(req.params.userId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: "Cap nhat nguoi dung thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const setUserStatusHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await setUserStatus(req.params.userId, req.body.status, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: "Cap nhat trang thai thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const deleteUserHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await deleteUser(req.params.userId, { force: req.body.force === "true" }, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: "Xoa tai khoan thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const restoreUserHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await restoreUser(req.params.userId, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: "Khoi phuc tai khoan thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const resetPasswordHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    const { newPassword } = await resetUserPassword(req.params.userId, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: `Mat khau moi: ${newPassword}`
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const sendResetEmailHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await sendPasswordResetEmail(req.params.userId, actorId);
    return res.redirect(buildRedirect("/admin/users", {
      status: "success",
      message: "Da gui email khoi phuc (gia lap)"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/users", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminFoodPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const [categoriesRaw, productsRaw] = await Promise.all([
      listCategories(),
      listProducts({ includeInactive: true })
    ]);
    const categories = toPlainList(categoriesRaw);
    const products = toPlainList(productsRaw);
    return renderAdminPage(res, "admin/foods", {
      categories,
      products,
      statusMessage,
      statusType,
      activeMenu: "foods",
      title: "Quản lý món ăn"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/foods", {
      categories: [],
      products: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "foods",
      title: "Quản lý món ăn"
    });
  }
};

const createProductHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await createProduct(req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Them mon an thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updateProductHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updateProduct(req.params.productId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Cap nhat mon an thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const toggleProductHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await toggleProductAvailability(req.params.productId, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Cap nhat trang thai mon an thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const deleteProductHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await deleteProduct(req.params.productId, { force: req.body.force === "true" }, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Xoa mon an thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const createCategoryHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await createCategory(req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Them danh muc thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updateCategoryHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updateCategory(req.params.categoryId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Cap nhat danh muc thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const deleteCategoryHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await deleteCategory(req.params.categoryId, { force: req.body.force === "true" }, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Xoa danh muc thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const createOptionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await createProductOption(req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Them tuy chon thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updateOptionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updateProductOption(req.params.optionId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Cap nhat tuy chon thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const deleteOptionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await deleteProductOption(req.params.optionId, actorId);
    return res.redirect(buildRedirect("/admin/foods", {
      status: "success",
      message: "Xoa tuy chon thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/foods", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminOrdersPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const filter = req.query.filter || "all";
    const searchTerm = req.query.q || "";
    const [ordersRaw, staffRaw, shippersRaw] = await Promise.all([
      listOrders({ status: filter, search: searchTerm }),
      User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] }),
      User.findAll({ where: { role: "shipper" }, attributes: ["user_id", "full_name", "username"] })
    ]);
    const orders = toPlainList(ordersRaw);
    const staff = toPlainList(staffRaw);
    const shippers = toPlainList(shippersRaw);
    return renderAdminPage(res, "admin/orders", {
      orders,
      staff,
      shippers,
      filter,
      searchTerm,
      statusMessage,
      statusType,
      activeMenu: "orders",
      title: "Quản lý đơn hàng"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/orders", {
      orders: [],
      staff: [],
      shippers: [],
      filter: req.query.filter || "all",
      searchTerm: req.query.q || "",
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "orders",
      title: "Quản lý đơn hàng"
    });
  }
};

const assignOrderHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await assignOrder(req.params.orderId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/orders", {
      status: "success",
      message: "Phan cong don hang thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/orders", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updateOrderStatusHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updateOrderStatus(req.params.orderId, req.body.status, actorId);
    return res.redirect(buildRedirect("/admin/orders", {
      status: "success",
      message: "Cap nhat trang thai don hang thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/orders", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const refundOrderHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await markOrderRefund(req.params.orderId, actorId);
    return res.redirect(buildRedirect("/admin/orders", {
      status: "success",
      message: "Hoan tien don hang thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/orders", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminPromotionsPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const promotions = toPlainList(await listPromotions());
    return renderAdminPage(res, "admin/promotions", {
      promotions,
      statusMessage,
      statusType,
      activeMenu: "promotions",
      title: "Quản lý khuyến mãi"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/promotions", {
      promotions: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "promotions",
      title: "Quản lý khuyến mãi"
    });
  }
};

const createPromotionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await createPromotion(req.body, actorId);
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "success",
      message: "Tao khuyen mai thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const updatePromotionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await updatePromotion(req.params.promoId, req.body, actorId);
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "success",
      message: "Cap nhat khuyen mai thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const togglePromotionHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await togglePromotion(req.params.promoId, actorId);
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "success",
      message: "Cap nhat trang thai khuyen mai thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/promotions", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminReportsPage = async (req, res) => {
  try {
    const report = await getReportOverview();
    return renderAdminPage(res, "admin/reports", {
      report,
      activeMenu: "reports",
      title: "Thống kê & Báo cáo"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/reports", {
      report: null,
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "reports",
      title: "Thống kê & Báo cáo"
    });
  }
};

const adminSettingsPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const [settingsRaw, backups] = await Promise.all([
      listSystemSettings(),
      getBackupList()
    ]);
    const settings = toPlainList(settingsRaw);
    return renderAdminPage(res, "admin/settings", {
      settings,
      backups,
      statusMessage,
      statusType,
      activeMenu: "settings",
      title: "Cấu hình hệ thống"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/settings", {
      settings: [],
      backups: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "settings",
      title: "Cấu hình hệ thống"
    });
  }
};

const updateSettingsHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    const entries = Array.isArray(req.body.keys)
      ? req.body.keys.map((key, index) => ({
        key,
        value: Array.isArray(req.body.values) ? req.body.values[index] : req.body.values,
        group: Array.isArray(req.body.groups) ? req.body.groups[index] : req.body.groups,
        description: Array.isArray(req.body.descriptions) ? req.body.descriptions[index] : req.body.descriptions
      }))
      : [{
        key: req.body.key,
        value: req.body.value,
        group: req.body.group,
        description: req.body.description
      }];

    await upsertSystemSetting(entries, actorId);
    return res.redirect(buildRedirect("/admin/settings", {
      status: "success",
      message: "Cap nhat cau hinh thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/settings", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const createBackupHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await createBackup(actorId);
    return res.redirect(buildRedirect("/admin/settings", {
      status: "success",
      message: "Da tao ban sao du lieu"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/settings", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const restoreBackupHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await restoreFromBackup(req.body.fileName, actorId);
    return res.redirect(buildRedirect("/admin/settings", {
      status: "success",
      message: "Phuc hoi cau hinh tu ban sao"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/settings", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminLogsPage = async (req, res) => {
  try {
    const logs = toPlainList(await listSystemLogs({ limit: 100 }));
    return renderAdminPage(res, "admin/logs", {
      logs,
      activeMenu: "logs",
      title: "Nhật ký hệ thống"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/logs", {
      logs: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "logs",
      title: "Nhật ký hệ thống"
    });
  }
};

const adminInventoryPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const items = toPlainList(await listInventory());
    return renderAdminPage(res, "admin/inventory", {
      items,
      statusMessage,
      statusType,
      activeMenu: "inventory",
      title: "Quản lý tồn kho"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/inventory", {
      items: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "inventory",
      title: "Quản lý tồn kho"
    });
  }
};

const upsertInventoryHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await upsertInventoryItem(req.body, actorId);
    return res.redirect(buildRedirect("/admin/inventory", {
      status: "success",
      message: "Cap nhat ton kho thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/inventory", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

const adminShiftsPage = async (req, res) => {
  const statusMessage = req.query.message;
  const statusType = req.query.status || "info";
  try {
    const [shiftsRaw, staffRaw] = await Promise.all([
      listStaffShifts(),
      User.findAll({ where: { role: "staff" }, attributes: ["user_id", "full_name", "username"] })
    ]);
    const shifts = toPlainList(shiftsRaw);
    const staff = toPlainList(staffRaw);
    return renderAdminPage(res, "admin/shifts", {
      shifts,
      staff,
      statusMessage,
      statusType,
      activeMenu: "shifts",
      title: "Lịch làm việc"
    });
  } catch (error) {
    return renderAdminPage(res, "admin/shifts", {
      shifts: [],
      staff: [],
      statusMessage: safeErrorMessage(error),
      statusType: "error",
      activeMenu: "shifts",
      title: "Lịch làm việc"
    });
  }
};

const scheduleShiftHandler = async (req, res) => {
  const actorId = resolveActorId(req);
  try {
    await scheduleStaffShift(req.body, actorId);
    return res.redirect(buildRedirect("/admin/shifts", {
      status: "success",
      message: "Them lich lam viec thanh cong"
    }));
  } catch (error) {
    return res.redirect(buildRedirect("/admin/shifts", {
      status: "error",
      message: safeErrorMessage(error)
    }));
  }
};

export {
  adminDashboardPage,
  adminUsersPage,
  createUserHandler,
  updateUserHandler,
  setUserStatusHandler,
  deleteUserHandler,
  restoreUserHandler,
  resetPasswordHandler,
  sendResetEmailHandler,
  adminFoodPage,
  createProductHandler,
  updateProductHandler,
  toggleProductHandler,
  deleteProductHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  createOptionHandler,
  updateOptionHandler,
  deleteOptionHandler,
  adminOrdersPage,
  assignOrderHandler,
  updateOrderStatusHandler,
  refundOrderHandler,
  adminPromotionsPage,
  createPromotionHandler,
  updatePromotionHandler,
  togglePromotionHandler,
  adminReportsPage,
  adminSettingsPage,
  updateSettingsHandler,
  createBackupHandler,
  restoreBackupHandler,
  adminLogsPage,
  adminInventoryPage,
  upsertInventoryHandler,
  adminShiftsPage,
  scheduleShiftHandler
};
