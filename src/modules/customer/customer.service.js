"use strict";

import { Op, fn, col, literal, UniqueConstraintError } from "sequelize";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import db from "../../models/index.js";
import { ensureProductImageColumns, ensureNewsImageColumns } from "../../utils/schemaEnsurer.js";
import { mapImageFields } from "../../utils/imageMapper.js";
import { isMissingColumnError, isMissingTableError } from "../../utils/dbErrors.js";
import { generateAIReply } from "../chat/ai.service.js";
import { prepareOrderForFulfillment, assignOrderToOnDutyStaff } from "../order/orderFulfillment.service.js";

const {
  sequelize,
  User,
  Order,
  OrderItem,
  Product,
  ProductOption,
  Payment,
  Promotion,
  News,
  Cart,
  CartItem,
  Message,
  Conversation,
  ChatMessage
} = db;

class CustomerServiceError extends Error {
  constructor(message, statusCode = 400, code = "CUSTOMER_SERVICE_ERROR", metadata = {}) {
    super(message);
    this.name = "CustomerServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

const toPlain = (item) => (item?.get ? item.get({ plain: true }) : item);

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

const excludeImageColumnsWhenUnsupported = (supportsBlob) =>
  supportsBlob ? undefined : { exclude: ["image_data", "image_mime"] };

const ensureCustomerUser = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new CustomerServiceError("Khong tim thay nguoi dung", 404, "USER_NOT_FOUND");
  }
  if (!["customer", "admin"].includes(user.role)) {
    throw new CustomerServiceError("Vai tro khong duoc phep thuc hien thao tac nay", 403, "ROLE_NOT_ALLOWED");
  }
  return user;
};

const sanitizeNote = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 255) : null;
};

const sanitizePhoneNumber = (value) => {
  if (!value) return null;
  return String(value)
    .replace(/[^0-9+]/g, "")
    .trim();
};

const getCartItemsFromPayload = (payload = {}) => {
  const candidates = payload.items ?? payload.cart_items ?? payload.cartItems;
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new CustomerServiceError("Don hang phai co it nhat mot san pham", 422, "ORDER_ITEMS_REQUIRED");
  }
  return candidates;
};

const normalizeCartItems = (items = []) =>
  items.map((entry, index) => {
    const productId = Number(entry.product_id ?? entry.productId);
    if (!productId || Number.isNaN(productId)) {
      throw new CustomerServiceError(`Ma san pham khong hop le tai vi tri ${index + 1}`, 422, "PRODUCT_INVALID");
    }
    const quantity = Number(entry.quantity ?? entry.qty ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new CustomerServiceError(`So luong phai lon hon 0 tai vi tri ${index + 1}`, 422, "QUANTITY_INVALID");
    }
    const optionsRaw =
      Array.isArray(entry.selected_options) || Array.isArray(entry.selectedOptions)
        ? entry.selected_options || entry.selectedOptions
        : [];
    const selectedOptions = optionsRaw
      .map((option) => {
        const optionId = Number(option?.option_id ?? option?.optionId ?? option);
        return Number.isFinite(optionId) ? { optionId } : null;
      })
      .filter(Boolean);
    return {
      productId,
      quantity,
      selectedOptions
    };
  });

const buildCartOrderDetails = async (items) => {
  const normalized = normalizeCartItems(items);
  const uniqueProductIds = [...new Set(normalized.map((item) => item.productId))];
  const products = await Product.findAll({
    where: {
      product_id: uniqueProductIds,
      is_active: true
    }
  });
  if (products.length !== uniqueProductIds.length) {
    const missing = uniqueProductIds.filter((id) => !products.some((product) => product.product_id === id));
    throw new CustomerServiceError("Mot so san pham khong ton tai hoac da ngung ban", 404, "PRODUCT_NOT_FOUND", { missing });
  }
  const productMap = products.reduce((acc, product) => acc.set(product.product_id, product), new Map());

  const optionIds = normalized.flatMap((item) => item.selectedOptions.map((opt) => opt.optionId));
  const uniqueOptionIds = [...new Set(optionIds)].filter((id) => Number.isFinite(id));
  let optionMap = new Map();
  if (uniqueOptionIds.length) {
    const options = await ProductOption.findAll({
      where: {
        option_id: uniqueOptionIds,
        is_active: true
      }
    });
    optionMap = options.reduce((acc, option) => acc.set(option.option_id, option), new Map());
  }

  const orderItemsPayload = normalized.map((item, index) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new CustomerServiceError(`San pham ${item.productId} khong hop le`, 404, "PRODUCT_NOT_FOUND", { productId: item.productId });
    }
    const optionDetails = item.selectedOptions.map((opt) => {
      const option = optionMap.get(opt.optionId);
      if (!option) {
        throw new CustomerServiceError("Khong tim thay tuy chon", 404, "OPTION_NOT_FOUND", { optionId: opt.optionId });
      }
      if (option.product_id !== product.product_id) {
        throw new CustomerServiceError("Tuy chon khong phu hop voi san pham", 400, "OPTION_MISMATCH", {
          productId: product.product_id,
          optionId: opt.optionId
        });
      }
      return option;
    });
    const optionAdjustment = optionDetails.reduce((sum, option) => sum + Number(option.price_adjustment || 0), 0);
    const unitPrice = Number((Number(product.price || 0) + optionAdjustment).toFixed(2));
    return {
      product_id: product.product_id,
      quantity: item.quantity,
      price: unitPrice
    };
  });

  const totalAmount = orderItemsPayload.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { orderItemsPayload, totalAmount: Number(totalAmount.toFixed(2)) };
};

const ORDER_INCLUDES = [
  {
    model: OrderItem,
    include: [{ model: Product }]
  },
  { model: Payment }
];

const persistOrderRecord = async (
  {
    userId,
    totalAmount,
    status,
    paymentMethod,
    createdByEmployeeId,
    originalAmount,
    note,
    orderItemsPayload,
    expectedDeliveryTime,
    deliveryFee
  },
  transaction
) => {
  const order = await Order.create(
    {
      user_id: userId,
      total_amount: totalAmount,
      delivery_fee: Number.isFinite(Number(deliveryFee)) ? Number(deliveryFee) : 0,
      status,
      payment_method: paymentMethod || null,
      created_by_employee_id: createdByEmployeeId || null,
      original_amount: originalAmount !== undefined ? originalAmount : totalAmount,
      note: sanitizeNote(note),
      expected_delivery_time: expectedDeliveryTime ? new Date(expectedDeliveryTime) : null
    },
    { transaction }
  );
  if (orderItemsPayload.length) {
    await OrderItem.bulkCreate(
      orderItemsPayload.map((item) => ({ ...item, order_id: order.order_id })),
      { transaction }
    );
  }
  return order;
};

const fetchOrderWithDetails = async (orderId, transaction) => {
  const order = await Order.findByPk(orderId, {
    include: ORDER_INCLUDES,
    transaction
  });
  if (!order) {
    throw new CustomerServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND", { orderId });
  }
  return order;
};

const ensureStaffUser = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user || !["staff", "admin"].includes(user.role)) {
    throw new CustomerServiceError("Nhan vien khong hop le", 403, "STAFF_FORBIDDEN", { userId });
  }
  return user;
};

const ensureAdminUser = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user || user.role !== "admin") {
    throw new CustomerServiceError("Quyen admin khong duoc phep", 403, "ADMIN_FORBIDDEN", { userId });
  }
  return user;
};

const createGuestCustomer = async ({ name, phone, email } = {}, transaction) => {
  const timestamp = Date.now();
  const suffix = crypto.randomBytes(3).toString("hex");
  const username = `guest-${timestamp}-${suffix}`.slice(0, 100);
  const password = crypto.randomBytes(8).toString("hex");
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const normalizedEmail =
    typeof email === "string" && email.includes("@") ? email.toLowerCase() : `${username}@guest.local`;
  const user = await User.create(
    {
      username,
      email: normalizedEmail,
      password: hashed,
      role: "customer",
      status: "active",
      full_name: name ? String(name).trim() : "Khach hang",
      phone_number: phone
    },
    { transaction }
  );
  return user.user_id;
};

const resolveCustomerAccount = async (customerInfo = {}, transaction) => {
  if (customerInfo.customer_id) {
    const existing = await User.findOne({
      where: {
        user_id: customerInfo.customer_id,
        role: "customer"
      },
      transaction
    });
    if (!existing) {
      throw new CustomerServiceError("Khong tim thay khach hang", 404, "CUSTOMER_NOT_FOUND", {
        customer_id: customerInfo.customer_id
      });
    }
    return existing.user_id;
  }
  const phone = sanitizePhoneNumber(customerInfo.phone_number || customerInfo.phone || customerInfo.mobile);
  if (!phone) {
    throw new CustomerServiceError("Thieu thong tin khach hang", 400, "CUSTOMER_INFO_REQUIRED");
  }
  const existing = await User.findOne({
    where: {
      phone_number: phone,
      role: "customer"
    },
    transaction
  });
  if (existing) return existing.user_id;
  return createGuestCustomer(
    {
      name: customerInfo.name || customerInfo.full_name,
      phone,
      email: customerInfo.email || customerInfo.email_address
    },
    transaction
  );
};

const createCashPaymentRecord = async ({ orderId, paymentMethod, amount, employeeId, transaction }) => {
  const normalized = String(paymentMethod || "cash").trim().toLowerCase();
  if (!["cash", "cod"].includes(normalized)) return;
  await Payment.create(
    {
      order_id: orderId,
      provider: normalized === "cash" ? "cash" : "cod",
      amount,
      currency: "VND",
      status: "success",
      meta: {
        method: normalized,
        handled_by: employeeId
      }
    },
    { transaction }
  );
};

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const PROFILE_FIELDS = ["full_name", "phone_number", "address", "gender"];
const VALID_GENDERS = new Set(["male", "female", "other", "unknown"]);

const sanitizeProfileFields = (payload = {}) => {
  const result = {};
  PROFILE_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      return;
    }
    const value = payload[field];
    if (field === "gender") {
      if (value === null || value === undefined) {
        result[field] = "unknown";
        return;
      }
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
      result[field] = VALID_GENDERS.has(normalized) ? normalized : "unknown";
      return;
    }
    if (value === null || value === undefined) {
      result[field] = null;
      return;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      result[field] = trimmed.length ? trimmed : null;
      return;
    }
    result[field] = value;
  });
  return result;
};

const hasMeaningfulProfileValue = (payload = {}) =>
  PROFILE_FIELDS.some((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      return false;
    }
    const value = payload[field];
    if (field === "gender") {
      return Boolean(value) && value !== "unknown";
    }
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return true;
  });

const profileHasStoredDetails = (user) =>
  Boolean(
    user?.full_name ||
    user?.phone_number ||
    user?.address ||
    (user?.gender && user.gender !== "unknown")
  );

const listActiveProducts = async ({ search, categoryId, limit } = {}) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const where = {};
  if (categoryId) {
    where.category_id = Number(categoryId);
  }
  if (search) {
    where.name = { [Op.like]: `%${search.trim()}%` };
  }

  const options = {
    where,
    include: [{ model: db.ProductOption, as: "options" }],
    order: [["updated_at", "DESC"]]
  };

  if (limit) {
    const parsedLimit = Number(limit);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      options.limit = Math.min(parsedLimit, 50);
    }
  }

  if (!supportsBlob) {
    options.attributes = excludeImageColumnsWhenUnsupported(supportsBlob);
  }

  let products;
  try {
    products = await Product.findAll(options);
  } catch (error) {
    if (supportsBlob && isMissingColumnError(error)) {
      console.warn("Falling back to URL-only product images due to missing columns.");
      products = await Product.findAll({
        ...options,
        attributes: excludeImageColumnsWhenUnsupported(false)
      });
    } else if (isMissingTableError(error)) {
      console.warn("Products table not found; returning empty list to customer.");
      products = [];
    } else {
      throw error;
    }
  }

  return products.map((product) => {
    const mapped = mapProductImage(product);
    mapped.options = Array.isArray(mapped.options) ? mapped.options : [];
    return mapped;
  });
};

const listNews = async ({ limit, search } = {}) => {
  const supportsBlob = (await ensureNewsImageColumns()) !== false;
  const query = {
    order: [["created_at", "DESC"]],
    paranoid: false
  };

  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  if (normalizedSearch) {
    const escaped = normalizedSearch.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${escaped}%`;
    query.where = {
      [Op.or]: [{ title: { [Op.like]: pattern } }, { content: { [Op.like]: pattern } }]
    };
  }

  if (limit) {
    const parsedLimit = Number(limit);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      query.limit = Math.min(parsedLimit, 20);
    }
  }

  if (!supportsBlob) {
    query.attributes = excludeImageColumnsWhenUnsupported(supportsBlob);
  }

  let items;
  try {
    items = await News.findAll(query);
  } catch (error) {
    if (supportsBlob && isMissingColumnError(error)) {
      console.warn("Falling back to URL-only news images for customer API due to missing columns.");
      items = await News.findAll({
        ...query,
        attributes: excludeImageColumnsWhenUnsupported(false)
      });
    } else if (isMissingTableError(error)) {
      console.warn("News table not found; returning empty list to customer.");
      items = [];
    } else {
      console.error("Customer listNews error:", error);
      return [];
    }
  }

  return items.map((item) => {
    const plain = item.get({ plain: true });
    return mapImageFields(plain, { includeMime: supportsBlob });
  });
};

const mapOrderPlain = (order) => {
  const plain = order.get({ plain: true });
  const items = Array.isArray(plain.OrderItems) ? plain.OrderItems : [];
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  return {
    ...plain,
    items_subtotal: Number(itemsSubtotal.toFixed(2)),
    items: items.map((item) => ({
      order_item_id: item.order_item_id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
      product: item.Product ? mapProductImage(item.Product) : null
    }))
  };
};

const buildOrderSummary = (ordersByStatus, totalSpentRaw) => {
  const summaryMap = ordersByStatus.reduce((acc, item) => {
    acc[item.status] = Number(item.count || 0);
    return acc;
  }, {});

  const totalOrders = ordersByStatus.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const completedOrders = summaryMap.completed || 0;
  const activeOrders = (summaryMap.pending || 0) + (summaryMap.confirmed || 0) + (summaryMap.preparing || 0) + (summaryMap.delivering || 0) + (summaryMap.shipping || 0);
  const canceledOrders = summaryMap.canceled || 0;
  const totalSpent = Number(totalSpentRaw || 0);
  const averageOrderValue = totalOrders ? Number((totalSpent / totalOrders).toFixed(0)) : 0;

  return {
    totalOrders,
    completedOrders,
    activeOrders,
    canceledOrders,
    totalSpent,
    averageOrderValue
  };
};

const getCustomerDashboard = async (userId) => {
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const productImageAttributes = resolveProductImageAttributes(supportsBlob);
  let profile = null;
  let ordersByStatus = [];
  let totalSpent = 0;
  let recentOrders = [];

  if (userId) {
    const user = await ensureCustomerUser(userId);
    profile = toPlain(user);

    [ordersByStatus, totalSpent, recentOrders] = await Promise.all([
      Order.findAll({
        where: { user_id: userId },
        attributes: ["status", [fn("COUNT", col("status")), "count"]],
        group: ["status"],
        raw: true
      }),
      Order.sum("total_amount", {
        where: {
          user_id: userId,
          status: { [Op.notIn]: ["canceled", "refunded"] }
        }
      }),
      Order.findAll({
        where: { user_id: userId },
        include: [
          {
            model: OrderItem,
            include: [{ model: Product, attributes: productImageAttributes }]
          }
        ],
        order: [["created_at", "DESC"]],
        limit: 5
      })
    ]);

    recentOrders = recentOrders.map(mapOrderPlain);
  }

  const now = new Date();

  const [activePromotions, topProducts] = await Promise.all([
    Promotion.findAll({
      where: {
        is_active: true,
        start_date: { [Op.lte]: now },
        end_date: { [Op.gte]: now },
        [Op.or]: [
          { applicable_roles: null },
          literal("JSON_CONTAINS(COALESCE(applicable_roles, '[]'), '\"customer\"')")
        ]
      },
      order: [["end_date", "ASC"]],
      limit: 5
    }),
    OrderItem.findAll({
      attributes: [
        "product_id",
        [fn("SUM", col("quantity")), "totalSold"],
        [literal("SUM(`OrderItem`.`quantity` * `OrderItem`.`price`)"), "revenue"]
      ],
      include: [
        {
          model: Product,
          attributes: productImageAttributes
        }
      ],
      group: ["product_id", "Product.product_id"],
      order: [[literal("totalSold"), "DESC"]],
      limit: 6
    })
  ]);

  const formattedTopProducts = topProducts.map((item) => ({
    product_id: item.product_id,
    totalSold: Number(item.get("totalSold") || 0),
    revenue: Number(item.get("revenue") || 0),
    product: item.Product ? mapProductImage(item.Product) : null
  }));

  return {
    profile,
    orderSummary: buildOrderSummary(ordersByStatus, totalSpent),
    recentOrders,
    activePromotions: activePromotions.map(toPlain),
    recommendations: formattedTopProducts
  };
};

const listOrdersForCustomer = async (userId, { status } = {}) => {
  await ensureCustomerUser(userId);
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const productImageAttributes = resolveProductImageAttributes(supportsBlob);
  const where = { user_id: userId };
  if (status && status !== "all") {
    where.status = status;
  }

  let orders;
  try {
    orders = await Order.findAll({
      where,
      include: [
        {
          model: OrderItem,
          include: [{ model: Product, attributes: productImageAttributes }]
        }
      ],
      order: [["created_at", "DESC"]]
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn("Orders table not found; returning empty list to customer.");
      return [];
    }
    throw error;
  }

  return orders.map(mapOrderPlain);
};

const getCustomerOrder = async (userId, orderId) => {
  await ensureCustomerUser(userId);
  const supportsBlob = (await ensureProductImageColumns()) !== false;
  const productImageAttributes = resolveProductImageAttributes(supportsBlob);
  let order;
  try {
    order = await Order.findOne({
      where: { order_id: orderId, user_id: userId },
      include: [
        {
          model: OrderItem,
          include: [{ model: Product, attributes: productImageAttributes }]
        }
      ]
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new CustomerServiceError("Khong co du lieu don hang trong he thong", 404, "ORDER_TABLE_MISSING");
    }
    throw error;
  }
  if (!order) {
    throw new CustomerServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND");
  }
  return mapOrderPlain(order);
};

const createOrderForCustomer = async (userId, payload = {}) => {
  await ensureCustomerUser(userId);
  const cartItems = getCartItemsFromPayload(payload);
    const { orderItemsPayload, totalAmount: itemsSubtotal } = await buildCartOrderDetails(cartItems);
    const shippingFeeRaw =
      payload?.shipping_fee ?? payload?.shippingFee ?? payload?.delivery_fee ?? payload?.deliveryFee ?? 0;
    const shippingFeeNumber = Number(shippingFeeRaw);
    const deliveryFee = Number.isFinite(shippingFeeNumber) && shippingFeeNumber > 0 ? shippingFeeNumber : 0;
    const finalTotal = Number((itemsSubtotal + deliveryFee).toFixed(2));
    const normalizedPayment = String(payload.payment_method || "online").toLowerCase();
    const initialStatus = normalizedPayment === "cod" ? "confirmed" : "pending";
    const order = await sequelize.transaction(async (transaction) => {
      const created = await persistOrderRecord(
        {
          userId,
          totalAmount: finalTotal,
          status: initialStatus,
          paymentMethod: normalizedPayment,
          createdByEmployeeId: null,
          originalAmount: itemsSubtotal,
          note: payload.note,
          expectedDeliveryTime: payload.expectedDeliveryTime,
          orderItemsPayload,
          deliveryFee
        },
        transaction
      );

    // Always prepare order for fulfillment to emit Socket.IO events
    // For COD (status=confirmed), this will assign staff and notify them
    // For online payment (status=pending), this will just assign staff
    await prepareOrderForFulfillment(created, { transaction });

    const detailed = await fetchOrderWithDetails(created.order_id, transaction);
    return mapOrderPlain(detailed);
  });
  return order;
};

const createOrderForEmployee = async (employeeId, payload = {}) => {
  await ensureStaffUser(employeeId);
  const cartItems = getCartItemsFromPayload(payload);
    const { orderItemsPayload, totalAmount: itemsSubtotal } = await buildCartOrderDetails(cartItems);
    const shippingFeeRaw =
      payload?.shipping_fee ?? payload?.shippingFee ?? payload?.delivery_fee ?? payload?.deliveryFee ?? 0;
    const shippingFeeNumber = Number(shippingFeeRaw);
    const deliveryFee = Number.isFinite(shippingFeeNumber) && shippingFeeNumber > 0 ? shippingFeeNumber : 0;
    const totalAmount = Number((itemsSubtotal + deliveryFee).toFixed(2));
    const customerInfo = payload.customer_info || {};
    const paymentMethod = payload.payment_method || "cash";

    const order = await sequelize.transaction(async (transaction) => {
      const customerId = await resolveCustomerAccount(customerInfo, transaction);
    const created = await persistOrderRecord(
      {
        userId: customerId,
        totalAmount,
        status: "confirmed",
          paymentMethod,
          createdByEmployeeId: employeeId,
          originalAmount: itemsSubtotal,
          note: payload.notes,
          expectedDeliveryTime: payload.expectedDeliveryTime,
          orderItemsPayload,
          deliveryFee
        },
        transaction
      );
    await createCashPaymentRecord({
      orderId: created.order_id,
      paymentMethod,
        amount: totalAmount,
        employeeId,
        transaction
      });
    await prepareOrderForFulfillment(created, { transaction });
    const detailed = await fetchOrderWithDetails(created.order_id, transaction);
    return mapOrderPlain(detailed);
  });

  return order;
};

const createOrderForAdmin = async (adminId, payload = {}) => {
  await ensureAdminUser(adminId);
  const cartItems = getCartItemsFromPayload(payload);
    const { orderItemsPayload, totalAmount: itemsSubtotal } = await buildCartOrderDetails(cartItems);
    const shippingFeeRaw =
      payload?.shipping_fee ?? payload?.shippingFee ?? payload?.delivery_fee ?? payload?.deliveryFee ?? 0;
    const shippingFeeNumber = Number(shippingFeeRaw);
    const deliveryFee = Number.isFinite(shippingFeeNumber) && shippingFeeNumber > 0 ? shippingFeeNumber : 0;
    let finalTotal = Number((itemsSubtotal + deliveryFee).toFixed(2));
    if (typeof payload.override_price !== "undefined" && payload.override_price !== null) {
      finalTotal = Number(payload.override_price);
    }
    if (payload.is_complimentary) {
      finalTotal = Number(payload.override_price ?? 0);
  }
  if (Number.isNaN(finalTotal) || finalTotal < 0) {
    throw new CustomerServiceError("Gia tri don hang khong hop le", 422, "ORDER_TOTAL_INVALID");
  }
  const paymentMethod = payload.payment_method || "cash";

  const order = await sequelize.transaction(async (transaction) => {
    const customerId = await resolveCustomerAccount(payload.customer_info || {}, transaction);
    const created = await persistOrderRecord(
      {
        userId: customerId,
        totalAmount: finalTotal,
        status: "confirmed",
          paymentMethod,
          createdByEmployeeId: adminId,
          originalAmount: itemsSubtotal,
          note: payload.notes,
          expectedDeliveryTime: payload.expectedDeliveryTime,
          orderItemsPayload,
          deliveryFee
        },
        transaction
      );
    await createCashPaymentRecord({
      orderId: created.order_id,
      paymentMethod,
      amount: finalTotal,
      employeeId: adminId,
      transaction
    });
    await prepareOrderForFulfillment(created, { transaction });
    const detailed = await fetchOrderWithDetails(created.order_id, transaction);
    return mapOrderPlain(detailed);
  });

  return order;
};

const cancelCustomerOrder = async (userId, orderId) => {
  await ensureCustomerUser(userId);
  const order = await Order.findOne({ where: { order_id: orderId, user_id: userId } });
  if (!order) {
    throw new CustomerServiceError("Khong tim thay don hang", 404, "ORDER_NOT_FOUND");
  }

  if (["completed", "canceled", "refunded"].includes(order.status)) {
    throw new CustomerServiceError("Don hang khong the huy o trang thai hien tai", 409, "ORDER_NOT_CANCELABLE", {
      status: order.status
    });
  }

  order.status = "canceled";
  await order.save();

  return mapOrderPlain(order);
};

const getProfile = async (userId) => {
  const user = await ensureCustomerUser(userId);
  return toPlain(user);
};

const createProfile = async (userId, payload = {}) => {
  const user = await ensureCustomerUser(userId);
  if (profileHasStoredDetails(user)) {
    throw new CustomerServiceError(
      "Thong tin nguoi dung da ton tai. Vui long su dung chuc nang cap nhat.",
      409,
      "PROFILE_ALREADY_EXISTS"
    );
  }

  const updates = sanitizeProfileFields(payload);
  if (!Object.keys(updates).length || !hasMeaningfulProfileValue(updates)) {
    throw new CustomerServiceError(
      "Vui long cung cap it nhat mot truong thong tin.",
      422,
      "PROFILE_MISSING_FIELDS"
    );
  }

  if (!Object.prototype.hasOwnProperty.call(updates, "gender")) {
    updates.gender = "unknown";
  }

  await user.update({
    full_name: null,
    phone_number: null,
    address: null,
    gender: "unknown",
    ...updates
  });

  return toPlain(user);
};

const updateProfile = async (userId, payload = {}) => {
  const user = await ensureCustomerUser(userId);
  const updates = sanitizeProfileFields(payload);

  if (!Object.keys(updates).length) {
    throw new CustomerServiceError("Khong co truong nao duoc cap nhat", 422, "NO_UPDATES");
  }

  await user.update(updates);
  return toPlain(user);
};

const deleteProfile = async (userId) => {
  const user = await ensureCustomerUser(userId);
  await user.update({
    full_name: null,
    phone_number: null,
    address: null,
    gender: "unknown"
  });
  return toPlain(user);
};

// ========================= Cart =========================
const getOrCreateCart = async (userId) => {
  await ensureCustomerUser(userId);
  let cart = await Cart.findOne({ where: { user_id: userId } });
  if (!cart) {
    cart = await Cart.create({ user_id: userId });
  }
  return cart;
};

const listCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  const items = await CartItem.findAll({
    where: { cart_id: cart.cart_id },
    include: [{ model: Product }],
    order: [["updated_at", "DESC"]]
  });

  const mapped = items.map((row) => {
    const plain = row.get({ plain: true });
    const product = plain.Product ? mapProductImage(plain.Product) : null;
    const price = Number(product?.price || 0);
    const qty = Number(plain.quantity || 1);
    return {
      cart_item_id: plain.cart_item_id,
      product_id: plain.product_id,
      quantity: qty,
      price,
      subtotal: Math.round(price * qty * 100) / 100,
      product
    };
  });

  const subtotal = mapped.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  const total_items = mapped.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

  return { items: mapped, subtotal, total_items };
};

const addItemToCart = async (userId, { productId, quantity } = {}) => {
  const normalizedProductId = Number(productId);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    throw new CustomerServiceError("Ma san pham khong hop le", 422, "PRODUCT_INVALID");
  }
  const product = await Product.findByPk(normalizedProductId);
  if (!product) {
    throw new CustomerServiceError("Khong tim thay mon an", 404, "PRODUCT_NOT_FOUND");
  }
  const cart = await getOrCreateCart(userId);
  const qty = Math.max(1, Number(quantity) || 1);
  const existing = await CartItem.findOne({
    where: { cart_id: cart.cart_id, product_id: product.product_id },
    paranoid: false
  });
  try {
    if (!existing) {
      await CartItem.create({
        cart_id: cart.cart_id,
        product_id: product.product_id,
        quantity: qty
      });
    } else {
      if (existing.deleted_at) {
        await existing.restore();
        await existing.update({ quantity: qty });
      } else {
        await existing.update({ quantity: (Number(existing.quantity) || 0) + qty });
      }
    }
    return listCart(userId);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const retryItem = await CartItem.findOne({
        where: { cart_id: cart.cart_id, product_id: product.product_id },
        paranoid: false
      });
      if (retryItem) {
        if (retryItem.deleted_at) {
          await retryItem.restore();
          await retryItem.update({ quantity: qty });
        } else {
          await retryItem.update({ quantity: (Number(retryItem.quantity) || 0) + qty });
        }
        return listCart(userId);
      }
    }
    throw error;
  }
};

const updateCartItemQuantity = async (userId, productId, quantity) => {
  const cart = await getOrCreateCart(userId);
  const item = await CartItem.findOne({ where: { cart_id: cart.cart_id, product_id: productId } });
  if (!item) {
    throw new CustomerServiceError("Mon an khong co trong gio", 404, "CART_ITEM_NOT_FOUND");
  }
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) {
    await item.destroy({ force: true });
    return listCart(userId);
  }
  await item.update({ quantity: qty });
  return listCart(userId);
};

const removeCartItem = async (userId, productId) => {
  const cart = await getOrCreateCart(userId);
  await CartItem.destroy({ where: { cart_id: cart.cart_id, product_id: productId }, force: true });
  return listCart(userId);
};

const clearCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  await CartItem.destroy({ where: { cart_id: cart.cart_id }, force: true });
  return listCart(userId);
};

// ========================= Support =========================
const listMySupportMessages = async (userId) => {
  await ensureCustomerUser(userId);
  const items = await Message.findAll({
    where: { user_id: userId },
    include: [{ model: User, attributes: ["user_id", "username", "full_name"] }],
    order: [["created_at", "ASC"]],
    paranoid: false
  });
  return items.map((row) => row.get({ plain: true }));
};

const createSupportMessage = async (userId, content) => {
  const user = await ensureCustomerUser(userId);
  const text = String(content || '').trim();

  const row = await Message.create({
    user_id: user.user_id,
    message: text,
    from_role: 'user',
    channel: 'web',
    sent_at: new Date()
  });

  // Link to conversation + mirror user message
  let convo = null;
  try {
    convo = await findOrCreateConversation(user.user_id);
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
  if (convo) {
    try {
      await ChatMessage.create({ conversation_id: convo.conversation_id, sender_role: 'user', body: text });
      await convo.update({ last_message_at: new Date() });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  // Auto or AI reply
  let replyText = generateAutoReplyV2(text);
  const isFallback = (v) => !v || /^cam on ban da lien he/i.test(String(v).toLowerCase());
  if (isFallback(replyText) && process.env.OPENAI_API_KEY) {
    try {
      replyText = await generateAIReply({ userId, text, history: [] });
    } catch { }
  }

  if (replyText) {
    await row.update({ reply: replyText, from_role: 'bot' });
    if (convo) {
      try {
        await ChatMessage.create({ conversation_id: convo.conversation_id, sender_role: 'bot', body: replyText });
        await convo.update({ last_message_at: new Date() });
      } catch (error) {
        if (!isMissingTableError(error)) throw error;
      }
    }
  }

  const plain = row.get({ plain: true });
  plain.User = { user_id: user.user_id, username: user.username, full_name: user.full_name };
  return plain;
};

// ===== Conversation helpers =====
const findOrCreateConversation = async (userId) => {
  let convo = await Conversation.findOne({ where: { user_id: userId, status: 'open' }, order: [["updated_at", "DESC"]] });
  if (!convo) {
    convo = await Conversation.create({ user_id: userId, status: 'open', last_message_at: new Date() });
  }
  return convo;
};

const listMyConversationMessages = async (userId, { limit = 200 } = {}) => {
  await ensureCustomerUser(userId);
  let convo = null;
  try {
    convo = await findOrCreateConversation(userId);
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }

  let items = null;
  if (convo) {
    try {
      items = await ChatMessage.findAll({
        where: { conversation_id: convo.conversation_id },
        order: [["created_at", "ASC"]],
        limit: Math.min(Number(limit) || 200, 500)
      });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  if (!items) {
    const legacy = await Message.findAll({ where: { user_id: userId }, order: [["created_at", "ASC"]], paranoid: false });
    items = legacy.flatMap((m) => {
      const list = [{ chat_message_id: m.message_id * 2 - 1, conversation_id: 0, sender_role: "user", body: m.message, created_at: m.created_at, updated_at: m.updated_at }];
      if (m.reply) {
        list.push({ chat_message_id: m.message_id * 2, conversation_id: 0, sender_role: "staff", body: m.reply, created_at: m.updated_at, updated_at: m.updated_at });
      }
      return list;
    });
  }

  const plain = items.map((r) => (r?.get ? r.get({ plain: true }) : r));
  if (!plain.length) {
    const greeting = [
      'Chào bạn! Mình là FatBot – trợ lý của FatFood. 😊',
      '',
      'Bạn cần hỗ trợ gì ạ?',
      '1) Xem thực đơn & Đặt hàng 🍔',
      '2) Khuyến mãi hôm nay 🔥',
      '3) Kiểm tra tình trạng đơn hàng 🛵',
      '4) Địa chỉ & Giờ mở cửa 📍',
      '5) Gặp nhân viên hỗ trợ 🧑‍💼'
    ].join('\n')
    return [{ chat_message_id: 0, conversation_id: 0, sender_role: 'bot', body: greeting, created_at: new Date(), updated_at: new Date() }];
  }
  return plain;
};

const appendMyConversationMessage = async (userId, content) => {
  const user = await ensureCustomerUser(userId);
  let convo = null;
  try {
    convo = await findOrCreateConversation(userId);
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }

  const body = String(content || '').trim();
  if (!body) return null;

  let userMsg = null;
  if (convo) {
    try {
      userMsg = await ChatMessage.create({ conversation_id: convo.conversation_id, sender_role: 'user', body });
      await convo.update({ last_message_at: new Date() });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      await Message.create({ user_id: userId, message: body, from_role: 'user', channel: 'web', sent_at: new Date() });
    }
  } else {
    await Message.create({ user_id: userId, message: body, from_role: 'user', channel: 'web', sent_at: new Date() });
  }

  let summaryRow = null;
  try {
    summaryRow = await Message.create({
      user_id: userId,
      message: body,
      from_role: "user",
      channel: "web",
      sent_at: new Date()
    });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }

  // Auto/AI reply
  let replyText = generateAutoReplyV2(body);
  const isFallback = (v) => !v || /^cam on ban da lien he/i.test(String(v).toLowerCase());
  if (isFallback(replyText) && process.env.OPENAI_API_KEY) {
    try {
      const history = await listMyConversationMessages(userId, { limit: 50 }).catch(() => []);
      replyText = await generateAIReply({ userId, text: body, history: Array.isArray(history) ? history : [] });
    } catch { }
  }

  let botMsg = null;
  if (replyText && convo) {
    try {
      botMsg = await ChatMessage.create({ conversation_id: convo.conversation_id, sender_role: 'bot', body: replyText });
      await convo.update({ last_message_at: new Date() });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  if (replyText && summaryRow) {
    try {
      await summaryRow.update({ reply: replyText });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  const summaryPlain = summaryRow
    ? {
        ...summaryRow.get({ plain: true }),
        User: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name
        }
      }
    : null;

  return {
    user: userMsg ? userMsg.get({ plain: true }) : null,
    bot: botMsg ? botMsg.get({ plain: true }) : null,
    summary: summaryPlain
  };
};

// ===== Auto-reply engine (simple keyword rules) =====
const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const containsAny = (s, arr) => {
  const n = normalize(s);
  return arr.some((kw) => n.includes(normalize(kw)));
};

// New, richer auto-reply engine aligned with quick-reply menu
const generateAutoReplyV2 = (content) => {
  const c = String(content || '')
  const n = normalize(c)
  const plain = n.trim()

  // Numeric choices matching Main Menu
  if (plain === '1') {
    return [
      'Tuyệt! Bạn muốn xem món gì hôm nay? Dưới đây là danh mục phổ biến:',
      '• Gà Rán Giòn Tan 🍗',
      '• Burger & Khoai Tây 🍔🍟',
      '• Combo Siêu Tiết Kiệm 💥',
      '• Đồ uống & Tráng miệng 🥤🍨',
      '',
      'Bạn có thể xem đầy đủ menu tại trang /menu và đặt hàng nhanh nhé!'
    ].join('\n')
  }
  if (plain === '2') {
    return [
      'Hôm nay có ưu đãi hấp dẫn:',
      '• Combo "Ăn Trưa No Nê" chỉ 59k (1 Gà + 1 Nước + 1 Khoai nhỏ)',
      '• Mua 1 Tặng 1 Burger Bò vào thứ Ba hàng tuần',
      '• Freeship cho đơn từ 150k',
      '',
      'Bạn muốn đặt ngay deal nào hay xem thêm chi tiết ạ?'
    ].join('\n')
  }
  if (plain === '3') {
    return 'Bạn vui lòng nhập Số điện thoại hoặc Mã đơn (ví dụ: #F12345) để mình kiểm tra ngay nhé!'
  }
  if (plain === '4') {
    return [
      'Bạn muốn xem Giờ mở cửa hay tìm cửa hàng gần bạn?',
      '• Giờ mở cửa: 9:00 - 22:00 mỗi ngày',
      '• Chia sẻ vị trí để mình gợi ý chi nhánh gần nhất, hoặc xem danh sách tại /stores'
    ].join('\n')
  }
  if (plain === '5') {
    return 'Mình sẽ kết nối bạn với nhân viên hỗ trợ ngay. Bạn vui lòng chờ trong giây lát nhé!'
  }

  // Working hours
  if (containsAny(c, ['mo cua', 'gio mo', 'gio dong', 'thoi gian lam viec', 'open', 'close'])) {
    return 'Hệ thống mở cửa từ 9:00 đến 22:00 mỗi ngày.'
  }

  // Menu
  if (containsAny(c, ['menu', 'thuc don', 'co mon gi', 'goi mon', 'dat hang'])) {
    return [
      'Bạn muốn xem danh mục nào ạ?',
      '• Gà Rán Giòn Tan 🍗',
      '• Burger & Khoai Tây 🍔🍟',
      '• Combo Siêu Tiết Kiệm 💥',
      '• Đồ uống & Tráng miệng 🥤🍨',
      '',
      'Xem đầy đủ và đặt nhanh tại /menu'
    ].join('\n')
  }

  // Delivery / shipping
  if (containsAny(c, ['giao hang', 'ship', 'shipper', 'phi van chuyen', 'phi ship'])) {
    return 'Bọn mình có giao hàng qua đối tác. Phí giao hàng hiển thị ở bước thanh toán, tuỳ khu vực.'
  }

  // Promotions
  if (containsAny(c, ['khuyen mai', 'ma giam gia', 'voucher', 'uu dai', 'deal'])) {
    return [
      'Ưu đãi hôm nay:',
      '• Combo "Ăn Trưa No Nê" 59k',
      '• Mua 1 Tặng 1 Burger Bò (Thứ Ba)',
      '• Freeship đơn từ 150k',
      'Bạn muốn đặt ngay hay xem chi tiết?'
    ].join('\n')
  }

  // Payment
  if (containsAny(c, ['thanh toan', 'momo', 'zalo pay', 'zalopay', 'vnpay', 'tien mat'])) {
    return 'Hỗ trợ thanh toán tiền mặt khi nhận hàng và một số ví/online (tuỳ khu vực).'
  }

  // Order status (ask for info)
  if (containsAny(c, ['don hang', 'trang thai don', 'kiem tra don', 'theo doi don', 'ma don'])) {
    return 'Bạn vui lòng cung cấp Số điện thoại hoặc Mã đơn (ví dụ: #F12345) để mình kiểm tra tình trạng đơn hàng nhé!'
  }

  // Address / location
  if (containsAny(c, ['dia chi', 'o dau', 'chi nhanh', 'cua hang gan', 'vi tri'])) {
    return 'Bạn có thể chia sẻ vị trí (📎) để mình gợi ý chi nhánh gần nhất, hoặc xem danh sách tại /stores. Giờ mở cửa 9:00–22:00.'
  }

  // Escalate to staff
  if (containsAny(c, ['gap nhan vien', 'gap nguoi that', 'tro giup'])) {
    return 'Mình sẽ kết nối bạn với nhân viên hỗ trợ trong giờ 8:00–22:00. Bạn vui lòng chờ trong giây lát nhé!'
  }

  // Fallback
  if (c.trim().length >= 1) {
    return [
      'Mình chưa hiểu rõ ý bạn 😅',
      'Bạn có thể chọn một trong các mục sau:',
      '1) Xem thực đơn 🍔   2) Kiểm tra đơn 🛵   3) Gặp nhân viên 🧑‍💼'
    ].join('\n')
  }
  return null
}
const generateAutoReply = (content) => {
  const c = String(content || '');

  // Working hours
  if (containsAny(c, ['mo cua', 'mo c⺀a', 'gio mo', 'gio dong', 'thoi gian lam viec', 'open', 'close'])) {
    return 'Quan mo cua tu 8:00 den 22:00 moi ngay.';
  }

  // Menu
  if (containsAny(c, ['menu', 'thuc don', 'co mon gi', 'goi mon'])) {
    return 'Ban co the xem menu va dat mon tai trang /menu.';
  }

  // Delivery / shipping
  if (containsAny(c, ['giao hang', 'ship', 'shipper', 'phi van chuyen', 'phi ship'])) {
    return 'Chung toi co giao hang qua doi tac. Phi giao hang duoc hien thi o buoc thanh toan tuy khu vuc.';
  }

  // Promotions
  if (containsAny(c, ['khuyen mai', 'ma giam gia', 'voucher', 'uu dai'])) {
    return 'Cac chuong trinh khuyen mai duoc cap nhat tai trang Khuyen Mai. Vui long kiem tra muc News/Promotions.';
  }

  // Payment
  if (containsAny(c, ['thanh toan', 'momo', 'zalo pay', 'zalopay', 'vnpay', 'tien mat'])) {
    return 'Ho tro thanh toan tien mat khi nhan hang va mot so vi dien tu/online tuy khu vuc.';
  }

  // Order status
  if (containsAny(c, ['don hang', 'trang thai don', 'kiem tra don'])) {
    return 'Ban co the xem trang thai don hang trong khu vuc tai khoan > Don hang.';
  }

  // Address / location
  if (containsAny(c, ['dia chi', 'o dau', 'chi nhanh'])) {
    return 'Hien chung toi phuc vu online va takeaway trong khung gio 8:00-22:00. Thong tin chi nhanh se duoc cap nhat tren trang chu.';
  }

  // Fallback
  if (c.length >= 4) {
    return 'Cam on ban da lien he! Nhan vien se ho tro ban som nhat.';
  }
  return null;
};

export {
  CustomerServiceError,
  listActiveProducts,
  listNews,
  getCustomerDashboard,
  listOrdersForCustomer,
  getCustomerOrder,
  createOrderForCustomer,
  createOrderForEmployee,
  createOrderForAdmin,
  cancelCustomerOrder,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  // support
  listMySupportMessages,
  createSupportMessage,
  listMyConversationMessages,
  appendMyConversationMessage,
  // cart
  listCart,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart
};





