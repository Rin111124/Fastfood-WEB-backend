"use strict";

import db from "../../models/index.js";

const { Order, OrderItem, Product, ProductOption } = db;

class PendingOrderError extends Error {
  constructor(message, code = "PENDING_ORDER_INVALID") {
    super(message);
    this.name = "PendingOrderError";
    this.code = code;
  }
}

const sanitizeText = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 255);
};

const normalizePendingOrderItems = (items = []) =>
  items.map((entry, index) => {
    const productId = Number(entry.product_id ?? entry.productId);
    if (!productId || Number.isNaN(productId)) {
      throw new PendingOrderError(`Ma san pham khong hop le tai vi tri ${index + 1}`);
    }
    const quantity = Number(entry.quantity ?? entry.qty ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new PendingOrderError(`So luong phai lon hon 0 tai vi tri ${index + 1}`);
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

const buildOrderItemsPayload = async (items = []) => {
  const normalized = normalizePendingOrderItems(items);
  if (!normalized.length) {
    throw new PendingOrderError("Don hang phai co it nhat mot san pham");
  }

  const uniqueProductIds = [...new Set(normalized.map((item) => item.productId))];
  const products = await Product.findAll({
    where: {
      product_id: uniqueProductIds,
      is_active: true
    }
  });
  if (products.length !== uniqueProductIds.length) {
    throw new PendingOrderError("Mot so san pham khong ton tai hoac da ngung ban");
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

  const orderItemsPayload = normalized.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new PendingOrderError(`San pham ${item.productId} khong hop le`);
    }
    const optionDetails = item.selectedOptions.map((opt) => {
      const option = optionMap.get(opt.optionId);
      if (!option) {
        throw new PendingOrderError("Khong tim thay tuy chon phu hop");
      }
      if (option.product_id !== product.product_id) {
        throw new PendingOrderError("Tuy chon khong phu hop voi san pham");
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

const preparePendingOrderPayload = async (rawPayload = {}, context = {}) => {
  const userId = Number(context.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new PendingOrderError("Khong xac dinh duoc nguoi dung de tao don hang");
  }

  const items = rawPayload?.items || rawPayload?.cart_items || rawPayload?.cartItems;
  if (!Array.isArray(items) || !items.length) {
    throw new PendingOrderError("Vui long chon san pham truoc khi thanh toan");
  }

  const { orderItemsPayload, totalAmount: itemsSubtotal } = await buildOrderItemsPayload(items);
  const shippingFeeRaw =
    rawPayload?.shipping_fee ??
    rawPayload?.shippingFee ??
    rawPayload?.delivery_fee ??
    rawPayload?.deliveryFee ??
    context?.shippingFee ??
    0;
  const shippingFeeNumber = Number(shippingFeeRaw);
  const shippingFee = Number.isFinite(shippingFeeNumber) && shippingFeeNumber > 0 ? shippingFeeNumber : 0;
  const totalAmount = Number((itemsSubtotal + shippingFee).toFixed(2));
  return {
    userId,
    orderItemsPayload,
    totalAmount,
    itemsSubtotal,
    shippingFee,
    paymentMethod: (rawPayload?.paymentMethod || rawPayload?.payment_method || context.defaultPaymentMethod || "online").toLowerCase(),
    note: sanitizeText(rawPayload?.note || rawPayload?.memo),
    expectedDeliveryTime: rawPayload?.expectedDeliveryTime || rawPayload?.expected_delivery_time || null
  };
};

const createOrderFromPendingPayload = async (pendingOrder, { transaction } = {}) => {
  if (!pendingOrder || !pendingOrder.orderItemsPayload || !Number.isFinite(pendingOrder.totalAmount)) {
    throw new PendingOrderError("Du lieu don hang tam thoi khong hop le");
  }
  const order = await Order.create(
    {
      user_id: pendingOrder.userId,
      total_amount: pendingOrder.totalAmount,
      delivery_fee: pendingOrder.shippingFee || 0,
      status: "paid",
      payment_method: pendingOrder.paymentMethod || "online",
      original_amount:
        pendingOrder.itemsSubtotal !== undefined ? pendingOrder.itemsSubtotal : pendingOrder.totalAmount,
      note: pendingOrder.note || null,
      expected_delivery_time: pendingOrder.expectedDeliveryTime
        ? new Date(pendingOrder.expectedDeliveryTime)
        : null
    },
    { transaction }
  );
  if (pendingOrder.orderItemsPayload.length) {
    await OrderItem.bulkCreate(
      pendingOrder.orderItemsPayload.map((item) => ({
        ...item,
        order_id: order.order_id
      })),
      { transaction }
    );
  }
  return order;
};

export { PendingOrderError, preparePendingOrderPayload, createOrderFromPendingPayload };
