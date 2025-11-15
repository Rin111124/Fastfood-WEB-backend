import { Op } from "sequelize";
import {
  AdminServiceError,
  logAction,
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
  updateProductAvailability,
  deleteProduct,
  listNews,
  createNews,
  updateNews,
  deleteNews,
  listProductOptions,
  createProductOption,
  updateProductOption,
  updateProductOptionAvailability,
  deleteProductOption,
  listOrders,
  listPayments,
  assignOrder,
  updateOrderStatus,
  markOrderRefund,
  updatePaymentStatus,
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
import { mapImageFields } from "../../utils/imageMapper.js";
import { createOrderForAdmin, createOrderForEmployee } from "../customer/customer.service.js";

const { User } = db;

const toPlain = (item) => (item?.get ? item.get({ plain: true }) : item);
const toPlainList = (list = []) => list.map(toPlain);

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return undefined;
};

const parseNumberField = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseIntegerField = (value) => {
  const parsed = parseNumberField(value);
  if (parsed === undefined) return undefined;
  return Number.isInteger(parsed) ? parsed : undefined;
};

const buildProductPayload = (req, { isUpdate = false } = {}) => {
  const body = req?.body || {};
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    payload.name = typeof body.name === "string" ? body.name.trim() : body.name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    payload.description =
      typeof body.description === "string" ? body.description.trim() : body.description;
  }

  if (typeof body.food_type === "string" && body.food_type.trim()) {
    payload.food_type = body.food_type.trim();
  }

  const categoryId = parseIntegerField(body.category_id ?? body.categoryId);
  if (categoryId !== undefined) {
    payload.category_id = categoryId;
  }

  const price = parseNumberField(body.price);
  if (price !== undefined) {
    payload.price = price;
  }

  const isActive = parseBoolean(body.is_active ?? body.isActive);
  if (typeof isActive === "boolean") {
    payload.is_active = isActive;
  }

  if (req?.file?.buffer) {
    payload.image_data = req.file.buffer;
    payload.image_mime = req.file.mimetype || "image/jpeg";
    payload.image_url = null;
  } else if (isUpdate && parseBoolean(body.removeImage)) {
    payload.image_data = null;
    payload.image_mime = null;
    payload.image_url = null;
  }

  return payload;
};

const mapNewsItem = (item) => {
  const plain = toPlain(item);
  if (!plain) return plain;
  return mapImageFields(plain, { includeMime: true });
};

const mapProductItem = (item) => {
  const plain = toPlain(item);
  if (!plain) return plain;
  return mapImageFields(plain);
};

const buildNewsPayload = (req, { isUpdate = false } = {}) => {
  const body = req?.body || {};
  const payload = {};

  // Handle title
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = typeof body.title === "string" ? body.title.trim() : body.title;
    if (!title) {
      throw new Error("Tiêu đề không được để trống");
    }
    payload.title = title;
  }

  // Handle content
  if (Object.prototype.hasOwnProperty.call(body, "content")) {
    const content = typeof body.content === "string" ? body.content.trim() : body.content;
    if (!content) {
      throw new Error("Nội dung không được để trống");
    }
    payload.content = content;
  }

  // Handle image
  if (req?.file?.buffer) {
    // Check image size (5MB limit)
    if (req.file.size > 5 * 1024 * 1024) {
      throw new Error("Kích thước ảnh không được vượt quá 5MB");
    }

    // Check image type
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const mime = req.file.mimetype;
    if (!allowedMimes.includes(mime)) {
      throw new Error("Chỉ chấp nhận ảnh định dạng: JPG, PNG, GIF, WEBP");
    }

    payload.image_data = req.file.buffer;
    payload.image_mime = mime;
    payload.image_url = null;
  } else if (isUpdate && parseBoolean(body.removeImage)) {
    payload.image_data = null;
    payload.image_mime = null;
    payload.image_url = null;
  }

  return payload;
};

const resolveActorId = (req) => {
  if (req?.auth?.user_id) return Number(req.auth.user_id);
  if (req?.session?.user?.user_id) return Number(req.session.user.user_id);
  if (req?.body?.actorId) return Number(req.body.actorId);
  if (req?.query?.actorId) return Number(req.query.actorId);
  return null;
};

const parseLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

const handleError = (res, error) => {
  if (error instanceof AdminServiceError) {
    return res.status(400).json({
      success: false,
      message: error.message,
      detail: error.metadata
    });
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const safeMessage =
    typeof error?.message === "string" && error.message.trim().length
      ? error.message
      : "Co loi xay ra, vui long thu lai sau.";

  console.error("Admin API error", error);

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

const sendFallbackSuccess = (res, data, message) =>
  res.status(200).json({
    success: true,
    data,
    fallback: true,
    ...(message ? { message } : {})
  });

const defaultDashboardPayload = {
  counters: {
    users: 0,
    orders: 0,
    revenueToday: 0
  },
  ordersByStatus: [],
  revenueByMonth: [],
  topProducts: []
};

const defaultReportOverview = {
  revenueByDay: [],
  ordersStatus: [],
  topProducts: []
};

const dashboardHandler = async (req, res) => {
  try {
    const metrics = await getDashboardMetrics();
    return res.json({ success: true, data: metrics });
  } catch (error) {
    console.error("Admin dashboard metrics error", error);
    return sendFallbackSuccess(res, defaultDashboardPayload, "Fallback dashboard data duoc su dung do loi may chu.");
  }
};

const listUsersHandler = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const users = await listUsers();
    return res.json({
      success: true,
      data: toPlainList(users).slice(0, limit)
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const createUserHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const result = await createUser(req.body, actorId);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateUserHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await updateUser(req.params.userId, req.body, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const setUserStatusHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await setUserStatus(req.params.userId, req.body?.status, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteUserHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const options = {};
    if (typeof req.body?.force !== "undefined") {
      options.force = String(req.body.force) === "true";
    }
    await deleteUser(req.params.userId, options, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const restoreUserHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await restoreUser(req.params.userId, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const resetPasswordHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const data = await resetUserPassword(req.params.userId, actorId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

const sendResetEmailHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await sendPasswordResetEmail(req.params.userId, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const listStaffHandler = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const staff = await User.findAll({
      where: { role: { [Op.in]: ["staff", "shipper"] } },
      attributes: ["user_id", "full_name", "username", "email", "status", "role"],
      order: [["updated_at", "DESC"]],
      limit
    });
    return res.json({
      success: true,
      data: toPlainList(staff)
    });
  } catch (error) {
    console.error("Admin list staff error", error);
    return sendFallbackSuccess(res, [], "Danh sach nhan vien tam thoi trong do loi may chu.");
  }
};

const listCategoriesHandler = async (req, res) => {
  try {
    const includeDeleted = String(req.query.includeDeleted || "").toLowerCase() === "true";
    const categories = await listCategories({ includeDeleted });
    return res.json({ success: true, data: toPlainList(categories) });
  } catch (error) {
    console.error("Admin list categories error", error);
    return sendFallbackSuccess(res, [], "Danh sach danh muc tam thoi trong do loi may chu.");
  }
};

const createCategoryHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const category = await createCategory(req.body, actorId);
    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateCategoryHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const category = await updateCategory(req.params.categoryId, req.body, actorId);
    return res.json({ success: true, data: category });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteCategoryHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await deleteCategory(req.params.categoryId, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const listProductsHandler = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const requestedIncludeInactive =
      typeof req.query.includeInactive !== "undefined" ? parseBoolean(req.query.includeInactive) : undefined;
    const includeInactive =
      requestedIncludeInactive === undefined ? true : requestedIncludeInactive;
    const includeDeleted = parseBoolean(req.query.includeDeleted) === true;
    const products = await listProducts({ includeInactive, includeDeleted });
    const data = toPlainList(products).slice(0, limit).map(mapProductItem);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Admin list products error", error);
    return sendFallbackSuccess(res, [], "Danh sach san pham tam thoi trong do loi may chu.");
  }
};

const createProductHandler = async (req, res) => {
  const payload = buildProductPayload(req);
  try {
    const actorId = resolveActorId(req);
    const product = await createProduct(payload, actorId);
    return res.status(201).json({ success: true, data: mapProductItem(product) });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateProductHandler = async (req, res) => {
  const payload = buildProductPayload(req, { isUpdate: true });
  try {
    const actorId = resolveActorId(req);
    const product = await updateProduct(req.params.productId, payload, actorId);
    return res.json({ success: true, data: mapProductItem(product) });
  } catch (error) {
    return handleError(res, error);
  }
};

const toggleProductHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const payload = {};
    if (typeof req.body?.is_active !== "undefined") {
      const parsed = parseBoolean(req.body.is_active);
      if (parsed !== undefined) payload.is_active = parsed;
    }
    if (typeof req.body?.isActive !== "undefined") {
      const parsed = parseBoolean(req.body.isActive);
      if (parsed !== undefined) payload.is_active = parsed;
    }
    if (typeof req.body?.pause_reason === "string") {
      payload.pause_reason = req.body.pause_reason;
    }
    if (typeof req.body?.reason === "string" && typeof payload.pause_reason === "undefined") {
      payload.pause_reason = req.body.reason;
    }
    if (req.body?.resume_at) {
      payload.resume_at = req.body.resume_at;
    }
    if (req.body?.paused_at) {
      payload.paused_at = req.body.paused_at;
    }
    const product = await updateProductAvailability(req.params.productId, payload, actorId);
    return res.json({ success: true, data: mapProductItem(product) });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteProductHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const options = {};
    if (typeof req.body?.force !== "undefined") {
      options.force = String(req.body.force) === "true";
    }
    await deleteProduct(req.params.productId, options, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const listNewsHandler = async (req, res) => {
  try {
    const includeDeleted = parseBoolean(req.query.includeDeleted) === true;
    const limit = parseLimit(req.query.limit, 50);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const items = await listNews({
      includeDeleted,
      limit,
      search: search && search.length ? search : undefined
    });
    const data = toPlainList(items).map(mapNewsItem);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

const createNewsHandler = async (req, res) => {
  const payload = buildNewsPayload(req);
  try {
    const actorId = resolveActorId(req);
    const created = await createNews(payload, actorId);
    return res.status(201).json({ success: true, data: mapNewsItem(created) });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateNewsHandler = async (req, res) => {
  const payload = buildNewsPayload(req, { isUpdate: true });
  try {
    const actorId = resolveActorId(req);
    const updated = await updateNews(req.params.newsId, payload, actorId);
    return res.json({ success: true, data: mapNewsItem(updated) });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteNewsHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const newsId = req.params.newsId;

    // Validate news ID
    if (!newsId || isNaN(Number(newsId))) {
      throw new Error("ID tin tức không hợp lệ");
    }

    // Check if force delete is requested
    const forceDelete = parseBoolean(req.body?.force ?? req.query?.force) === true;

    // Try to delete
    console.log(`Deleting news ${newsId} (force: ${forceDelete}) by user ${actorId}`);
    await deleteNews(newsId, { force: forceDelete }, actorId);

    // Return success with additional info
    return res.json({
      success: true,
      message: forceDelete ? "Đã xóa vĩnh viễn tin tức" : "Đã xóa tin tức",
      data: {
        newsId,
        force: forceDelete,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Delete news error:", error);
    return handleError(res, error);
  }
};

const listProductOptionsHandler = async (req, res) => {
  try {
    const filters = {};
    if (typeof req.query?.productId !== "undefined") {
      const parsed = Number(req.query.productId);
      if (!Number.isNaN(parsed)) {
        filters.productId = parsed;
      }
    }
    if (typeof req.query?.includeInactive !== "undefined") {
      const includeInactive = parseBoolean(req.query.includeInactive);
      filters.includeInactive = includeInactive === undefined ? true : includeInactive;
    }
    if (String(req.query.includeDeleted || "").toLowerCase() === "true") {
      filters.includeDeleted = true;
    }
    const options = await listProductOptions(filters);
    return res.json({ success: true, data: toPlainList(options) });
  } catch (error) {
    console.error("Admin list product options error", error);
    return sendFallbackSuccess(res, [], "Lua chon san pham tam thoi trong do loi may chu.");
  }
};

const createProductOptionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const option = await createProductOption(req.body, actorId);
    return res.status(201).json({ success: true, data: option });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateProductOptionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const option = await updateProductOption(req.params.optionId, req.body, actorId);
    return res.json({ success: true, data: option });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteProductOptionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    await deleteProductOption(req.params.optionId, actorId);
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

const createStaffOrderHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    if (!actorId) {
      return res.status(401).json({ success: false, message: "Chua dang nhap" });
    }
    const role = String(req?.auth?.role || "").toLowerCase();
    const payload = req.body || {};
    const order =
      role === "admin"
        ? await createOrderForAdmin(actorId, payload)
        : await createOrderForEmployee(actorId, payload);
    await logAction(actorId, "CREATE_ORDER", "orders", {
      orderId: order.order_id,
      customer_id: order.user_id,
      payment_method: order.payment_method,
      role
    });
    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    return handleError(res, error);
  }
};

const toggleProductOptionAvailabilityHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const payload = {};
    if (typeof req.body?.is_active !== "undefined") {
      const parsed = parseBoolean(req.body.is_active);
      if (parsed !== undefined) payload.is_active = parsed;
    }
    if (typeof req.body?.isActive !== "undefined") {
      const parsed = parseBoolean(req.body.isActive);
      if (parsed !== undefined) payload.is_active = parsed;
    }
    const option = await updateProductOptionAvailability(req.params.optionId, payload, actorId);
    return res.json({ success: true, data: option });
  } catch (error) {
    return handleError(res, error);
  }
};

const listOrdersHandler = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search
    };
    const orders = await listOrders(filters);
    const limit = parseLimit(req.query.limit, 100);
    return res.json({
      success: true,
      data: toPlainList(orders).slice(0, limit)
    });
  } catch (error) {
    console.error("Admin list orders error", error);
    return sendFallbackSuccess(res, [], "Danh sach don hang tam thoi trong do loi may chu.");
  }
};

const assignOrderHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const order = await assignOrder(req.params.orderId, req.body || {}, actorId);
    return res.json({ success: true, data: toPlain(order) });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateOrderStatusHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const order = await updateOrderStatus(req.params.orderId, req.body?.status, actorId);
    return res.json({ success: true, data: toPlain(order) });
  } catch (error) {
    return handleError(res, error);
  }
};

const refundOrderHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const order = await markOrderRefund(req.params.orderId, actorId);
    return res.json({ success: true, data: toPlain(order) });
  } catch (error) {
    return handleError(res, error);
  }
};

const listPromotionsHandler = async (req, res) => {
  try {
    const promos = await listPromotions();
    return res.json({ success: true, data: toPlainList(promos) });
  } catch (error) {
    console.error("Admin list promotions error", error);
    return sendFallbackSuccess(res, [], "Danh sach khuyen mai tam thoi trong do loi may chu.");
  }
};

const createPromotionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const promo = await createPromotion(req.body, actorId);
    return res.status(201).json({ success: true, data: promo });
  } catch (error) {
    return handleError(res, error);
  }
};

const updatePromotionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const promo = await updatePromotion(req.params.promoId, req.body, actorId);
    return res.json({ success: true, data: promo });
  } catch (error) {
    return handleError(res, error);
  }
};

const togglePromotionHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const promo = await togglePromotion(req.params.promoId, actorId);
    return res.json({ success: true, data: promo });
  } catch (error) {
    return handleError(res, error);
  }
};

const reportOverviewHandler = async (req, res) => {
  try {
    const data = await getReportOverview();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Admin report overview error", error);
    return sendFallbackSuccess(
      res,
      defaultReportOverview,
      "Bao cao tong quan dang su dung du lieu tam thoi do loi may chu."
    );
  }
};

const listSettingsHandler = async (req, res) => {
  try {
    const settings = await listSystemSettings();
    return res.json({ success: true, data: toPlainList(settings) });
  } catch (error) {
    console.error("Admin list settings error", error);
    return sendFallbackSuccess(res, [], "Danh sach cau hinh tam thoi trong do loi may chu.");
  }
};

const upsertSettingsHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const results = await upsertSystemSetting(entries, actorId);
    return res.json({ success: true, data: results });
  } catch (error) {
    return handleError(res, error);
  }
};

const listLogsHandler = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const logs = await listSystemLogs({ limit });
    return res.json({ success: true, data: toPlainList(logs) });
  } catch (error) {
    console.error("Admin list logs error", error);
    return sendFallbackSuccess(res, [], "Nhat ky he thong tam thoi khong the tai do loi may chu.");
  }
};

const listInventoryHandler = async (req, res) => {
  try {
    const items = await listInventory();
    return res.json({ success: true, data: toPlainList(items) });
  } catch (error) {
    console.error("Admin list inventory error", error);
    return sendFallbackSuccess(res, [], "Ton kho tam thoi trong do loi may chu.");
  }
};

const upsertInventoryHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const item = await upsertInventoryItem(req.body, actorId);
    return res.json({ success: true, data: toPlain(item) });
  } catch (error) {
    return handleError(res, error);
  }
};

const updatePaymentStatusHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const paymentId = Number(req.params.paymentId);
    const status = String(req.body?.status || req.query?.status || "").trim();
    if (!paymentId) {
      return res.status(400).json({ success: false, message: "Thieu paymentId" });
    }
    if (!status || !["initiated", "success", "failed", "refunded"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trang thai khong hop le" });
    }
    const payment = await updatePaymentStatus(paymentId, status, actorId);
    return res.json({ success: true, data: toPlain(payment) });
  } catch (error) {
    return handleError(res, error);
  }
};

const listBackupsHandler = async (req, res) => {
  try {
    const backups = await getBackupList();
    return res.json({ success: true, data: backups });
  } catch (error) {
    console.error("Admin list backups error", error);
    return sendFallbackSuccess(res, [], "Danh sach tep sao luu tam thoi trong do loi may chu.");
  }
};

const createBackupHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const backup = await createBackup(actorId);
    return res.status(201).json({ success: true, data: backup });
  } catch (error) {
    return handleError(res, error);
  }
};

const restoreBackupHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const result = await restoreFromBackup(req.params.fileName, actorId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error);
  }
};

const listShiftsHandler = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const shifts = await listStaffShifts();
    return res.json({ success: true, data: toPlainList(shifts).slice(0, limit) });
  } catch (error) {
    console.error("Admin list shifts error", error);
    return sendFallbackSuccess(res, [], "Lich lam viec tam thoi trong do loi may chu.");
  }
};

const scheduleShiftHandler = async (req, res) => {
  try {
    const actorId = resolveActorId(req);
    const shift = await scheduleStaffShift(req.body, actorId);
    return res.status(201).json({ success: true, data: toPlain(shift) });
  } catch (error) {
    return handleError(res, error);
  }
};

// Payments listing
const listPaymentsHandler = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      provider: req.query.provider
    };
    const items = await listPayments(filters);
    return res.json({ success: true, data: toPlainList(items) });
  } catch (error) {
    return handleError(res, error);
  }
};

export {
  dashboardHandler,
  listUsersHandler,
  createUserHandler,
  updateUserHandler,
  setUserStatusHandler,
  deleteUserHandler,
  restoreUserHandler,
  resetPasswordHandler,
  sendResetEmailHandler,
  listStaffHandler,
  listCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  listProductsHandler,
  createProductHandler,
  updateProductHandler,
  toggleProductHandler,
  deleteProductHandler,
  listNewsHandler,
  createNewsHandler,
  updateNewsHandler,
  deleteNewsHandler,
  listProductOptionsHandler,
  createProductOptionHandler,
  updateProductOptionHandler,
  toggleProductOptionAvailabilityHandler,
  deleteProductOptionHandler,
  createStaffOrderHandler,
  listOrdersHandler,
  listPaymentsHandler,
  assignOrderHandler,
  updateOrderStatusHandler,
  refundOrderHandler,
  listPromotionsHandler,
  createPromotionHandler,
  updatePromotionHandler,
  togglePromotionHandler,
  reportOverviewHandler,
  listSettingsHandler,
  upsertSettingsHandler,
  listLogsHandler,
  listInventoryHandler,
  upsertInventoryHandler,
  updatePaymentStatusHandler,
  listBackupsHandler,
  createBackupHandler,
  restoreBackupHandler,
  listShiftsHandler,
  scheduleShiftHandler
};
