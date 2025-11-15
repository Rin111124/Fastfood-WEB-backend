"use strict";

import { Buffer } from "buffer";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { Op, fn, col, literal } from "sequelize";
import db from "../../models/index.js";
import { ensureProductImageColumns, ensureNewsImageColumns } from "../../utils/schemaEnsurer.js";
import { isMissingColumnError, isMissingTableError } from "../../utils/dbErrors.js";
import { createOrderFromPendingPayload } from "../payment/pendingOrder.helper.js";
import {
  clearCustomerCart,
  recordPaymentActivity,
  prepareOrderForFulfillment
} from "../order/orderFulfillment.service.js";
import { sanitizeStationCode } from "../order/stationTask.helper.js";

const {
  User,
  Product,
  ProductCategory,
  ProductOption,
  Order,
  OrderItem,
  Payment,
  Promotion,
  InventoryItem,
  News,
  SystemSetting,
  SystemLog,
  StaffShift,
  sequelize
} = db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const BACKUP_DIR = path.join(__dirname, "..", "..", "..", "backups");

class AdminServiceError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = "AdminServiceError";
    this.metadata = metadata;
  }
}

const ensureBackupDirectory = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
};

const logAction = async (userId, action, resource, metadata = {}) => {
  try {
    await SystemLog.create({
      user_id: userId || null,
      action,
      resource,
      metadata
    });
  } catch (error) {
    console.error("Failed to log system action", { action, resource, error: error.message });
  }
};

const generateRandomPassword = () => {
  const hash = crypto.randomBytes(8).toString("base64");
  return hash.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "Temp1234";
};

const normalizeStringArray = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizePromotionPayload = (payload = {}) => {
  const normalized = { ...payload };
  if (normalized.discount_value !== undefined) {
    normalized.discount_value = Number(normalized.discount_value);
  }
  if (normalized.max_discount_value !== undefined && normalized.max_discount_value !== null && normalized.max_discount_value !== "") {
    normalized.max_discount_value = Number(normalized.max_discount_value);
  } else {
    normalized.max_discount_value = null;
  }
  if (normalized.min_order_amount !== undefined && normalized.min_order_amount !== null && normalized.min_order_amount !== "") {
    normalized.min_order_amount = Number(normalized.min_order_amount);
  } else {
    normalized.min_order_amount = null;
  }
  if (normalized.max_usage !== undefined && normalized.max_usage !== null && normalized.max_usage !== "") {
    normalized.max_usage = Number(normalized.max_usage);
  } else {
    normalized.max_usage = null;
  }
  if (normalized.usage_count !== undefined) {
    normalized.usage_count = Number(normalized.usage_count);
  }
  if (normalized.start_date) {
    normalized.start_date = new Date(normalized.start_date);
  }
  if (normalized.end_date) {
    normalized.end_date = new Date(normalized.end_date);
  }
  normalized.applicable_roles = normalizeStringArray(normalized.applicable_roles);
  normalized.applicable_categories = normalizeStringArray(normalized.applicable_categories);
  if (normalized.is_active !== undefined) {
    normalized.is_active = normalized.is_active === true || normalized.is_active === "true";
  }
  return normalized;
};

const getDashboardMetrics = async () => {
  const [userStats, orderStats, revenueToday, revenueByMonth, topProducts] = await Promise.all([
    User.count(),
    Order.count(),
    Order.sum("total_amount", {
      where: sequelize.where(fn("DATE", col("order_date")), fn("CURDATE"))
    }),
    Order.findAll({
      attributes: [
        [fn("DATE_FORMAT", col("order_date"), "%Y-%m"), "month"],
        [fn("SUM", col("total_amount")), "revenue"]
      ],
      group: [fn("DATE_FORMAT", col("order_date"), "%Y-%m")],
      order: [[literal("month"), "DESC"]],
      limit: 6,
      raw: true
    }),
    OrderItem.findAll({
      attributes: [
        "product_id",
        [fn("SUM", col("quantity")), "totalQuantity"]
      ],
      include: [{
        model: Product,
        attributes: ["name"]
      }],
      group: ["product_id", "Product.name"],
      order: [[literal("totalQuantity"), "DESC"]],
      limit: 5,
      raw: true
    })
  ]);

  const ordersByStatus = await Order.findAll({
    attributes: ["status", [fn("COUNT", col("order_id")), "count"]],
    group: ["status"],
    raw: true
  });

  const formattedOrdersByStatus = ordersByStatus.map((row) => ({
    status: row.status,
    count: Number(row.count || row.dataValues?.count || 0)
  }));

  const formattedRevenueByMonth = revenueByMonth.map((row) => ({
    month: row.month || row.dataValues?.month,
    revenue: Number(row.revenue || row.dataValues?.revenue || 0)
  }));

  const formattedTopProducts = topProducts.map((row) => ({
    product_id: row.product_id,
    productName: row["Product.name"] || row?.Product?.name || "Khong ro",
    totalQuantity: Number(row.totalQuantity || row.dataValues?.totalQuantity || 0)
  }));

  return {
    counters: {
      users: userStats,
      orders: orderStats,
      revenueToday: revenueToday || 0
    },
    ordersByStatus: formattedOrdersByStatus,
    revenueByMonth: formattedRevenueByMonth,
    topProducts: formattedTopProducts
  };
};

const listUsers = async () => {
  return User.findAll({
    attributes: { exclude: ["password"] },
    order: [["created_at", "DESC"]],
    paranoid: false
  });
};

const createUser = async (payload, actorId) => {
  const {
    username,
    password,
    email,
    role = "staff",
    status = "active",
    full_name,
    phone_number,
    gender,
    address
  } = payload;

  const existing = await User.findOne({
    where: {
      [Op.or]: [{ username }, { email }]
    },
    paranoid: false
  });

  if (existing) {
    throw new AdminServiceError("Username hoac email da ton tai");
  }

  const tempPassword = password || generateRandomPassword();
  const hashed = await bcrypt.hash(tempPassword, SALT_ROUNDS);

  const user = await User.create({
    username,
    password: hashed,
    email: email.toLowerCase(),
    role,
    status,
    full_name,
    phone_number,
    gender,
    address
  });

  await logAction(actorId, "CREATE_USER", "users", { username, role });

  return {
    user: user.get({ plain: true }),
    generatedPassword: password ? null : tempPassword
  };
};

const updateUser = async (userId, payload, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }

  const allowed = [
    "email",
    "role",
    "status",
    "full_name",
    "phone_number",
    "gender",
    "address"
  ];

  allowed.forEach((field) => {
    if (payload[field] !== undefined) {
      user[field] = payload[field];
    }
  });

  if (payload.password) {
    user.password = await bcrypt.hash(payload.password, SALT_ROUNDS);
  }

  await user.save();
  await logAction(actorId, "UPDATE_USER", "users", { userId, updates: payload });
  return user.get({ plain: true });
};

const setUserStatus = async (userId, status, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }
  user.status = status;
  await user.save();
  await logAction(actorId, "SET_USER_STATUS", "users", { userId, status });
  return user.get({ plain: true });
};

const deleteUser = async (userId, { force = false } = {}, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }
  await user.destroy({ force });
  await logAction(actorId, force ? "FORCE_DELETE_USER" : "DELETE_USER", "users", { userId });
};

const restoreUser = async (userId, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }
  await user.restore();
  user.status = "active";
  await user.save();
  await logAction(actorId, "RESTORE_USER", "users", { userId });
  return user.get({ plain: true });
};

const resetUserPassword = async (userId, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }
  const newPassword = generateRandomPassword();
  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();
  await logAction(actorId, "RESET_USER_PASSWORD", "users", { userId });
  return { newPassword };
};

const sendPasswordResetEmail = async (userId, actorId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) {
    throw new AdminServiceError("Khong tim thay nguoi dung", { userId });
  }
  const token = crypto.randomBytes(24).toString("hex");
  await logAction(actorId, "SEND_RESET_EMAIL", "users", { userId, token });
  console.info(`Reset password token for ${user.email}: ${token}`);
  return { token };
};

const listCategories = async ({ includeDeleted = false } = {}) => {
  const query = { order: [["category_name", "ASC"]] };
  if (includeDeleted) {
    query.paranoid = false;
  }
  return ProductCategory.findAll(query);
};

const createCategory = async (payload, actorId) => {
  const category = await ProductCategory.create(payload);
  await logAction(actorId, "CREATE_CATEGORY", "products_category", { category_id: category.category_id });
  return category.get({ plain: true });
};

const updateCategory = async (categoryId, payload, actorId) => {
  const category = await ProductCategory.findByPk(categoryId, { paranoid: false });
  if (!category) {
    throw new AdminServiceError("Khong tim thay danh muc", { categoryId });
  }
  await category.update(payload);
  await logAction(actorId, "UPDATE_CATEGORY", "products_category", { categoryId, payload });
  return category.get({ plain: true });
};

const deleteCategory = async (categoryId, { force = false } = {}, actorId) => {
  const category = await ProductCategory.findByPk(categoryId, { paranoid: false });
  if (!category) {
    throw new AdminServiceError("Khong tim thay danh muc", { categoryId });
  }
  await category.destroy({ force });
  await logAction(actorId, force ? "FORCE_DELETE_CATEGORY" : "DELETE_CATEGORY", "products_category", { categoryId });
};

const listProducts = async ({ includeInactive = true, includeDeleted = false } = {}) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const query = {
    where: includeInactive ? {} : { is_active: true },
    include: [
      { model: ProductCategory },
      { model: ProductOption, as: "options", paranoid: false }
    ],
    order: [["created_at", "DESC"]]
  };
  if (includeDeleted) {
    query.paranoid = false;
  }
  if (!supportsBlob) {
    query.attributes = excludeProductImageColumns(supportsBlob);
  }

  const executeQuery = async (attributes) =>
    Product.findAll(attributes ? { ...query, attributes } : query);

  try {
    return await executeQuery();
  } catch (error) {
    if (supportsBlob && isMissingColumnError(error)) {
      console.warn("Falling back to URL-only product images for admin API due to missing columns.");
      return executeQuery(excludeProductImageColumns(false));
    }
    if (isMissingTableError(error)) {
      console.warn("Products table not found; returning empty list.");
      return [];
    }
    throw error;
  }
};

const createProduct = async (payload, actorId) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const product = await Product.create(prepareProductPayload(payload, { supportsBlob }));
  await logAction(actorId, "CREATE_PRODUCT", "products", { product_id: product.product_id });
  return product.get({ plain: true });
};

const updateProduct = async (productId, payload, actorId) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const product = await Product.findByPk(productId, {
    paranoid: false,
    attributes: excludeProductImageColumns(supportsBlob)
  });
  if (!product) {
    throw new AdminServiceError("Khong tim thay san pham", { productId });
  }
  const preparedPayload = prepareProductPayload(payload, { supportsBlob });
  await product.update(preparedPayload);
  const sanitizedPayload = { ...preparedPayload };
  if (Object.prototype.hasOwnProperty.call(sanitizedPayload, "image_data")) {
    const data = sanitizedPayload.image_data;
    if (data && typeof data === "object") {
      const size = typeof data.length === "number" ? `${data.length} bytes` : "blob";
      sanitizedPayload.image_data = `[${size}]`;
    }
  }
  await logAction(actorId, "UPDATE_PRODUCT", "products", { productId, payload: sanitizedPayload });
  return product.get({ plain: true });
};

const parseNullableDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const updateProductAvailability = async (productId, payload = {}, actorId) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const product = await Product.findByPk(productId, {
    paranoid: false,
    attributes: excludeProductImageColumns(supportsBlob)
  });
  if (!product) {
    throw new AdminServiceError("Khong tim thay san pham", { productId });
  }

  let nextStatus;
  if (typeof payload.is_active === "boolean") {
    nextStatus = payload.is_active;
  } else if (typeof payload.isActive === "boolean") {
    nextStatus = payload.isActive;
  } else {
    nextStatus = !product.is_active;
  }

  product.is_active = nextStatus;

  if (nextStatus) {
    product.pause_reason = null;
    product.paused_at = null;
    product.resume_at = null;
  } else {
    product.pause_reason =
      typeof payload.pause_reason === "string"
        ? payload.pause_reason.trim().slice(0, 255)
        : typeof payload.reason === "string"
          ? payload.reason.trim().slice(0, 255)
          : product.pause_reason || null;
    product.paused_at = parseNullableDate(payload.paused_at) || new Date();
    product.resume_at = parseNullableDate(payload.resume_at);
  }

  await product.save();
  await logAction(
    actorId,
    product.is_active ? "RESUME_PRODUCT" : "PAUSE_PRODUCT",
    "products",
    {
      productId,
      is_active: product.is_active,
      pause_reason: product.pause_reason,
      paused_at: product.paused_at,
      resume_at: product.resume_at
    }
  );
  return product.get({ plain: true });
};

const toggleProductAvailability = async (productId, actorId) =>
  updateProductAvailability(productId, {}, actorId);

const deleteProduct = async (productId, { force = false } = {}, actorId) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const product = await Product.findByPk(productId, {
    paranoid: false,
    attributes: excludeProductImageColumns(supportsBlob)
  });
  if (!product) {
    throw new AdminServiceError("Khong tim thay san pham", { productId });
  }
  await product.destroy({ force });
  await logAction(actorId, force ? "FORCE_DELETE_PRODUCT" : "DELETE_PRODUCT", "products", { productId });
};

const prepareNewsPayload = (payload = {}, { supportsBlob }) => {
  if (!payload) return payload;
  const prepared = { ...payload };

  if (!supportsBlob && prepared.image_data) {
    try {
      const buffer = Buffer.isBuffer(prepared.image_data) ? prepared.image_data : Buffer.from(prepared.image_data);
      if (buffer?.length) {
        const mime = prepared.image_mime || "image/jpeg";
        prepared.image_url = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } catch (error) {
      console.warn("Failed to convert news image payload to data URI fallback:", error?.message || error);
    }
    delete prepared.image_data;
    delete prepared.image_mime;
  }

  if (prepared.image_data === null) {
    prepared.image_url = null;
  }

  return prepared;
};

const prepareProductPayload = (payload = {}, { supportsBlob }) => {
  if (!payload) return payload;
  const prepared = { ...payload };

  if (!supportsBlob && prepared.image_data) {
    try {
      const buffer = Buffer.isBuffer(prepared.image_data) ? prepared.image_data : Buffer.from(prepared.image_data);
      if (buffer?.length) {
        const mime = prepared.image_mime || "image/jpeg";
        prepared.image_url = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } catch (error) {
      console.warn("Failed to convert product image payload to data URI fallback:", error?.message || error);
    }
    delete prepared.image_data;
    delete prepared.image_mime;
  }

  if (prepared.image_data === null) {
    prepared.image_url = null;
  }
  if (
    Object.prototype.hasOwnProperty.call(prepared, "prep_station_code") ||
    Object.prototype.hasOwnProperty.call(prepared, "prepStationCode") ||
    Object.prototype.hasOwnProperty.call(prepared, "stationCode")
  ) {
    const stationSource = prepared.prep_station_code || prepared.prepStationCode || prepared.stationCode;
    prepared.prep_station_code = sanitizeStationCode(stationSource);
    delete prepared.prepStationCode;
    delete prepared.stationCode;
  }

  return prepared;
};

const excludeProductImageColumns = (supportsBlob) =>
  supportsBlob ? undefined : { exclude: ["image_data", "image_mime"] };

const listNews = async ({ includeDeleted = false, limit, search } = {}) => {
  const supportsBlob = (await ensureNewsImageColumns()) !== false;

  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 100;
  const parsedLimit = Number.parseInt(limit, 10);
  const resolvedLimit =
    Number.isNaN(parsedLimit) || parsedLimit <= 0 ? DEFAULT_LIMIT : Math.min(parsedLimit, MAX_LIMIT);
  const normalizedSearch = typeof search === "string" ? search.trim() : "";

  const newsAttributes = [
    "news_id",
    "title",
    "content",
    "image_url",
    "created_at",
    "updated_at"
  ];
  if (supportsBlob) {
    newsAttributes.splice(3, 0, "image_data", "image_mime");
  }

  const baseQuery = {
    order: [["created_at", "DESC"]],
    paranoid: !includeDeleted,
    attributes: newsAttributes,
    limit: resolvedLimit
  };

  if (normalizedSearch) {
    const escaped = normalizedSearch.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${escaped}%`;
    baseQuery.where = {
      [Op.or]: [{ title: { [Op.like]: pattern } }, { content: { [Op.like]: pattern } }]
    };
  }

  const QUERY_TIMEOUT_MS = 1200;
  let timeoutId;

  let queryDefinition = baseQuery;

  try {
    const results = await Promise.race([
      News.findAll(queryDefinition),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS);
      })
    ]);

    return results;
  } catch (error) {
    if (supportsBlob && isMissingColumnError(error)) {
      console.warn("Falling back to URL-only news images for admin API due to missing columns.");
      queryDefinition = {
        ...baseQuery,
        attributes: newsAttributes.filter((attribute) => attribute !== "image_data" && attribute !== "image_mime")
      };
      const results = await News.findAll(queryDefinition);
      return results;
    }
    if (isMissingTableError(error)) {
      console.warn("News table not found; returning empty list.");
      return [];
    }
    if (error.message === "Query timeout") {
      console.error("News query timed out");
      return [];
    }

    console.error("Error in listNews:", error);
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const createNews = async (payload, actorId) => {
  const supportsBlob = (await ensureNewsImageColumns()) !== false;
  try {
    const news = await News.create(prepareNewsPayload(payload, { supportsBlob }));
    await logAction(actorId, "CREATE_NEWS", "news", { news_id: news.news_id });
    return news.get({ plain: true });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AdminServiceError("Bang tin tuc chua duoc khoi tao. Vui long tao bang `news` hoac chay migrate.", {
        suggestion: "Run migrations to create the `news` table."
      });
    }
    throw error;
  }
};

const updateNews = async (newsId, payload, actorId) => {
  const supportsBlob = (await ensureNewsImageColumns()) !== false;
  let news;
  try {
    news = await News.findByPk(newsId, { paranoid: false });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AdminServiceError("Bang tin tuc chua duoc khoi tao. Vui long tao bang `news` hoac chay migrate.", {
        suggestion: "Run migrations to create the `news` table."
      });
    }
    throw error;
  }
  if (!news) {
    throw new AdminServiceError("Khong tim thay tin tuc", { newsId });
  }
  await news.update(prepareNewsPayload(payload, { supportsBlob }));
  await logAction(actorId, "UPDATE_NEWS", "news", { newsId, payload: { ...payload, image_data: undefined } });
  return news.get({ plain: true });
};

const deleteNews = async (newsId, { force = false } = {}, actorId) => {
  await ensureNewsImageColumns();
  let news;
  try {
    news = await News.findByPk(newsId, { paranoid: false });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AdminServiceError("Bang tin tuc chua duoc khoi tao. Khong the xoa.", {
        suggestion: "Run migrations to create the `news` table."
      });
    }
    throw error;
  }
  if (!news) {
    throw new AdminServiceError("Khong tim thay tin tuc", { newsId });
  }
  await news.destroy({ force });
  await logAction(actorId, force ? "FORCE_DELETE_NEWS" : "DELETE_NEWS", "news", { newsId });
};

const listProductOptions = async (filters = {}) => {
  const query = {
    order: [["group_name", "ASC"], ["sort_order", "ASC"]],
    where: {}
  };

  let productIdCandidate;

  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    if (filters.productId !== undefined && filters.productId !== null && filters.productId !== "") {
      productIdCandidate = filters.productId;
    } else if (filters.product_id !== undefined && filters.product_id !== null && filters.product_id !== "") {
      productIdCandidate = filters.product_id;
    }
    if (filters.includeDeleted) {
      query.paranoid = false;
    }
    if (filters.includeInactive === false) {
      query.where.is_active = true;
    }
  } else {
    productIdCandidate = filters;
  }

  if (productIdCandidate !== undefined && productIdCandidate !== null && productIdCandidate !== "") {
    const parsed = Number(productIdCandidate);
    if (!Number.isNaN(parsed)) {
      query.where.product_id = parsed;
    }
  }

  if (Object.keys(query.where).length === 0) {
    delete query.where;
  }

  return ProductOption.findAll(query);
};

const createProductOption = async (payload, actorId) => {
  const option = await ProductOption.create(payload);
  await logAction(actorId, "CREATE_OPTION", "product_options", { option_id: option.option_id });
  return option.get({ plain: true });
};

const updateProductOption = async (optionId, payload, actorId) => {
  const option = await ProductOption.findByPk(optionId, { paranoid: false });
  if (!option) {
    throw new AdminServiceError("Khong tim thay tuy chon", { optionId });
  }
  await option.update(payload);
  await logAction(actorId, "UPDATE_OPTION", "product_options", { optionId, payload });
  return option.get({ plain: true });
};

const deleteProductOption = async (optionId, actorId) => {
  const option = await ProductOption.findByPk(optionId, { paranoid: false });
  if (!option) {
    throw new AdminServiceError("Khong tim thay tuy chon", { optionId });
  }
  await option.destroy();
  await logAction(actorId, "DELETE_OPTION", "product_options", { optionId });
};

const updateProductOptionAvailability = async (optionId, payload = {}, actorId) => {
  const option = await ProductOption.findByPk(optionId, { paranoid: false });
  if (!option) {
    throw new AdminServiceError("Khong tim thay tuy chon", { optionId });
  }

  let nextStatus;
  if (typeof payload.is_active === "boolean") {
    nextStatus = payload.is_active;
  } else if (typeof payload.isActive === "boolean") {
    nextStatus = payload.isActive;
  } else {
    nextStatus = !option.is_active;
  }

  option.is_active = nextStatus;
  await option.save();
  await logAction(
    actorId,
    option.is_active ? "ACTIVATE_OPTION" : "PAUSE_OPTION",
    "product_options",
    { optionId, is_active: option.is_active }
  );
  return option.get({ plain: true });
};

const listOrders = async (filters = {}) => {
  const where = {};
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }
  if (filters.search) {
    where[Op.or] = [
      { '$User.username$': { [Op.like]: `%${filters.search}%` } },
      { '$User.full_name$': { [Op.like]: `%${filters.search}%` } }
    ];
  }

  return Order.findAll({
    where,
    include: [
      { model: User, attributes: ["user_id", "username", "full_name"] },
      { model: User, as: "staff", attributes: ["user_id", "username", "full_name"] },
      { model: User, as: "shipper", attributes: ["user_id", "username", "full_name"] },
      {
        model: OrderItem,
        include: [{ model: Product, attributes: ["name"] }]
      },
      { model: Payment }
    ],
    order: [["created_at", "DESC"]]
  });
};

const listPayments = async (filters = {}) => {
  const where = {};
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }
  if (filters.provider && filters.provider !== "all") {
    where.provider = filters.provider;
  }
  const include = [
    {
      model: Order,
      include: [{ model: User, attributes: ["user_id", "username", "full_name"] }]
    }
  ];
  return Payment.findAll({ where, include, order: [["created_at", "DESC"]] });
};

const assignOrder = async (orderId, { staffId, shipperId, expectedDeliveryTime }, actorId) => {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new AdminServiceError("Khong tim thay don hang", { orderId });
  }

  if (staffId) {
    const staff = await User.findByPk(staffId);
    if (!staff || !["staff", "admin"].includes(staff.role)) {
      throw new AdminServiceError("Nhan vien khong hop le", { staffId });
    }
    order.assigned_staff_id = staffId;
  }

  if (shipperId) {
    const shipper = await User.findByPk(shipperId);
    if (!shipper || shipper.role !== "shipper") {
      throw new AdminServiceError("Shipper khong hop le", { shipperId });
    }
    order.assigned_shipper_id = shipperId;
  }

  if (expectedDeliveryTime) {
    order.expected_delivery_time = expectedDeliveryTime;
  }

  await order.save();
  await logAction(actorId, "ASSIGN_ORDER", "orders", { orderId, staffId, shipperId });
  return order.get({ plain: true });
};

const updateOrderStatus = async (orderId, status, actorId) => {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new AdminServiceError("Khong tim thay don hang", { orderId });
  }

  order.status = status;
  if (status === "completed") {
    order.completed_at = new Date();
  }
  if (status === "canceled") {
    order.completed_at = null;
  }

  await order.save();
  await logAction(actorId, "UPDATE_ORDER_STATUS", "orders", { orderId, status });
  return order.get({ plain: true });
};

const markOrderRefund = async (orderId, actorId) => {
  const order = await Order.findByPk(orderId, { include: [Payment] });
  if (!order) {
    throw new AdminServiceError("Khong tim thay don hang", { orderId });
  }

  order.status = "refunded";
  await order.save();

  if (order.Payments?.length) {
    await Promise.all(order.Payments.map((payment) => payment.update({ status: "refunded" })));
  }

  await logAction(actorId, "REFUND_ORDER", "orders", { orderId });
  return order.get({ plain: true });
};

const updatePaymentStatus = async (paymentId, status, actorId) => {
  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    throw new AdminServiceError("Khong tim thay giao dich", { paymentId });
  }

  let orderUserId = null;
  if (status === "success") {
    await sequelize.transaction(async (t) => {
      let order = null;
      let needsFulfillment = false;
      if (!payment.order_id && payment.meta?.pending_order) {
        try {
          order = await createOrderFromPendingPayload(payment.meta.pending_order, { transaction: t });
        } catch (error) {
          throw new AdminServiceError(error.message || "Khong tao duoc don hang tu giao dich", {
            paymentId,
            code: error.code || "PENDING_ORDER_INVALID"
          });
        }
        payment.order_id = order.order_id;
        needsFulfillment = true;
      } else if (payment.order_id) {
        order = await Order.findByPk(payment.order_id, { transaction: t });
      }
      await payment.update({ status, order_id: payment.order_id }, { transaction: t });
      if (order) {
        if (needsFulfillment || (order.status !== "paid" && order.status !== "completed")) {
          if (order.status !== "paid" && order.status !== "completed") {
            await order.update({ status: "paid" }, { transaction: t });
          }
          await prepareOrderForFulfillment(order, { transaction: t });
          await recordPaymentActivity(order, payment.provider || "manual", {
            paymentId: payment.payment_id,
            txn_ref: payment.txn_ref
          });
        }
        orderUserId = order.user_id;
      }
    });
    if (orderUserId) {
      await clearCustomerCart(orderUserId);
    }
  } else {
    await payment.update({ status });
  }

  await logAction(actorId, "UPDATE_PAYMENT_STATUS", "payments", { paymentId, status });
  return payment.get({ plain: true });
};

const listPromotions = async () => Promotion.findAll({ paranoid: false, order: [["created_at", "DESC"]] });

const createPromotion = async (payload, actorId) => {
  const promo = await Promotion.create({
    ...normalizePromotionPayload(payload),
    created_by: actorId
  });
  await logAction(actorId, "CREATE_PROMOTION", "promotions", { promotion_id: promo.promotion_id });
  return promo.get({ plain: true });
};

const updatePromotion = async (promoId, payload, actorId) => {
  const promo = await Promotion.findByPk(promoId, { paranoid: false });
  if (!promo) {
    throw new AdminServiceError("Khong tim thay khuyen mai", { promoId });
  }
  await promo.update({ ...normalizePromotionPayload(payload), updated_by: actorId });
  await logAction(actorId, "UPDATE_PROMOTION", "promotions", { promoId, payload });
  return promo.get({ plain: true });
};

const togglePromotion = async (promoId, actorId) => {
  const promo = await Promotion.findByPk(promoId, { paranoid: false });
  if (!promo) {
    throw new AdminServiceError("Khong tim thay khuyen mai", { promoId });
  }
  promo.is_active = !promo.is_active;
  await promo.save();
  await logAction(actorId, "TOGGLE_PROMOTION", "promotions", { promoId, is_active: promo.is_active });
  return promo.get({ plain: true });
};

const getReportOverview = async () => {
  const revenueByDay = await Order.findAll({
    attributes: [
      [fn("DATE", col("order_date")), "date"],
      [fn("SUM", col("total_amount")), "revenue"]
    ],
    group: [fn("DATE", col("order_date"))],
    order: [[literal("date"), "DESC"]],
    limit: 14,
    raw: true
  });

  const ordersStatus = await Order.findAll({
    attributes: ["status", [fn("COUNT", col("order_id")), "count"]],
    group: ["status"],
    raw: true
  });

  const topProducts = await OrderItem.findAll({
    attributes: [
      "product_id",
      [fn("SUM", col("quantity")), "soldQuantity"],
      [literal("SUM(`OrderItem`.`quantity` * `OrderItem`.`price`)"), "revenue"]
    ],
    include: [{ model: Product, attributes: ["name", "food_type"] }],
    group: ["product_id", "Product.name", "Product.food_type"],
    order: [[literal("soldQuantity"), "DESC"]],
    limit: 10
  });

  return { revenueByDay, ordersStatus, topProducts };
};

const listSystemSettings = async () => SystemSetting.findAll({ order: [["group", "ASC"], ["key", "ASC"]], paranoid: false });

const upsertSystemSetting = async (entries = [], actorId) => {
  const results = [];
  for (const entry of entries) {
    const [setting] = await SystemSetting.findOrCreate({
      where: { key: entry.key },
      defaults: { ...entry, updated_by: actorId }
    });
    setting.value = entry.value;
    setting.group = entry.group || setting.group;
    setting.description = entry.description || setting.description;
    setting.updated_by = actorId;
    await setting.save();
    results.push(setting.get({ plain: true }));
  }
  await logAction(actorId, "UPSERT_SETTINGS", "system_settings", { keys: entries.map((e) => e.key) });
  return results;
};

const listSystemLogs = async ({ limit = 50 } = {}) => SystemLog.findAll({
  include: [{ model: User, attributes: ["user_id", "username"] }],
  order: [["created_at", "DESC"]],
  limit
});

const listInventory = async () => InventoryItem.findAll({
  include: [
    { model: Product, attributes: ["name"] },
    { model: User, as: "updater", attributes: ["username", "full_name"] }
  ],
  order: [["updated_at", "DESC"]],
  paranoid: false
});

const upsertInventoryItem = async (payload, actorId) => {
  let item;
  if (payload.inventory_id) {
    item = await InventoryItem.findByPk(payload.inventory_id, { paranoid: false });
    if (!item) {
      throw new AdminServiceError("Khong tim thay hang ton", { inventory_id: payload.inventory_id });
    }
    await item.update({ ...payload, updated_by: actorId });
  } else {
    item = await InventoryItem.create({ ...payload, updated_by: actorId });
  }
  await logAction(actorId, "UPSERT_INVENTORY", "inventory_items", { inventory_id: item.inventory_id });
  return item.get({ plain: true });
};

const getBackupList = async () => {
  await ensureBackupDirectory();
  const entries = await fs.readdir(BACKUP_DIR);
  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      path: path.join(BACKUP_DIR, name)
    }));
};

const createBackup = async (actorId) => {
  await Promise.all([ensureProductImageColumns(), ensureNewsImageColumns()]);
  await ensureBackupDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `fatfood-backup-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const payload = {
    createdAt: new Date().toISOString(),
    users: await User.findAll({ attributes: { exclude: ["password"] }, raw: true, paranoid: false }),
    products: await Product.findAll({ raw: true, paranoid: false }),
    productOptions: await ProductOption.findAll({ raw: true, paranoid: false }),
    categories: await ProductCategory.findAll({ raw: true, paranoid: false }),
    orders: await Order.findAll({ raw: true, paranoid: false }),
    orderItems: await OrderItem.findAll({ raw: true, paranoid: false }),
    payments: await Payment.findAll({ raw: true, paranoid: false }),
    promotions: await Promotion.findAll({ raw: true, paranoid: false }),
    news: await News.findAll({ raw: true, paranoid: false }),
    inventory: await InventoryItem.findAll({ raw: true, paranoid: false }),
    systemSettings: await SystemSetting.findAll({ raw: true, paranoid: false })
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  await logAction(actorId, "CREATE_BACKUP", "system", { filePath });
  return { fileName, filePath };
};

const restoreFromBackup = async (fileName, actorId) => {
  await ensureBackupDirectory();
  const filePath = path.join(BACKUP_DIR, fileName);
  const exists = await fs.stat(filePath).catch(() => null);
  if (!exists) {
    throw new AdminServiceError("Khong tim thay tep backup", { fileName });
  }
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);

  if (Array.isArray(data.systemSettings)) {
    await SystemSetting.destroy({ where: {}, truncate: true, force: true });
    await SystemSetting.bulkCreate(
      data.systemSettings.map((item) => ({
        ...item,
        created_at: item.created_at || new Date(),
        updated_at: item.updated_at || new Date()
      }))
    );
  }

  if (Array.isArray(data.promotions)) {
    await Promotion.destroy({ where: {}, truncate: true, force: true });
    await Promotion.bulkCreate(
      data.promotions.map((item) => ({
        ...item,
        created_at: item.created_at || new Date(),
        updated_at: item.updated_at || new Date()
      }))
    );
  }

  await logAction(actorId, "RESTORE_BACKUP", "system", { fileName });
  return { restored: ["systemSettings", "promotions"] };
};

const listStaffShifts = async () => StaffShift.findAll({
  include: [{ model: User, as: "staff", attributes: ["user_id", "username", "full_name"] }],
  order: [["shift_date", "DESC"]],
  paranoid: false
});

const scheduleStaffShift = async (payload, actorId) => {
  const shift = await StaffShift.create(payload);
  await logAction(actorId, "SCHEDULE_SHIFT", "staff_shifts", { shift_id: shift.shift_id });
  return shift.get({ plain: true });
};

export {
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
  toggleProductAvailability,
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
  scheduleStaffShift,
  updatePaymentStatus
};


