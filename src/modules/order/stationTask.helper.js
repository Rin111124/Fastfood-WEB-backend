"use strict";

import db from "../../models/index.js";

const { StationTask, OrderItem, Product, KitchenStation } = db;

const FALLBACK_STATION_BY_FOOD_TYPE = {
  burger: "grill",
  pizza: "grill",
  snack: "fryer",
  combo: "pack",
  dessert: "pack",
  drink: "drink",
  other: "pack"
};

const DEFAULT_PREP_SECONDS = {
  grill: 180,
  fryer: 120,
  drink: 45,
  pack: 60
};

const sanitizeStationCode = (value) => {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
};

const inferStationCodeFromProduct = (product) => {
  const direct = sanitizeStationCode(product?.prep_station_code || product?.station_code);
  if (direct) return direct;
  const inferred = FALLBACK_STATION_BY_FOOD_TYPE[String(product?.food_type || "").toLowerCase()];
  return inferred || "pack";
};

const ensureStationsExist = async (codes = [], { transaction } = {}) => {
  if (!codes.length) return new Map();
  const uniqueCodes = [...new Set(codes.map((code) => sanitizeStationCode(code)).filter(Boolean))];
  if (!uniqueCodes.length) return new Map();
  const existing = await KitchenStation.findAll({
    where: { code: uniqueCodes },
    transaction,
    paranoid: false
  });
  const existingMap = new Map(existing.map((station) => [station.code, station]));
  const missing = uniqueCodes.filter((code) => !existingMap.has(code));
  if (missing.length) {
    const now = new Date();
    await KitchenStation.bulkCreate(
      missing.map((code, idx) => ({
        code,
        name: code.toUpperCase(),
        station_type: "custom",
        description: `Auto created for ${code}`,
        is_active: true,
        is_pack_station: code === "pack",
        display_order: 50 + idx,
        capacity_per_batch: null,
        created_at: now,
        updated_at: now
      })),
      { transaction }
    );
    const refreshed = await KitchenStation.findAll({
      where: { code: uniqueCodes },
      transaction,
      paranoid: false
    });
    return new Map(refreshed.map((station) => [station.code, station]));
  }
  return existingMap;
};

const buildTaskPayloads = (orderItems = [], stationMap) => {
  const payloads = [];
  orderItems.forEach((item, index) => {
    const product = item.Product || item.product || {};
    const stationCode = inferStationCodeFromProduct(product);
    const station = stationMap.get(stationCode);
    payloads.push({
      order_id: item.order_id,
      order_item_id: item.order_item_id,
      station_code: stationCode,
      station_label_snapshot: station?.name || stationCode.toUpperCase(),
      quantity: item.quantity || 1,
      priority: index,
      expected_prep_seconds: DEFAULT_PREP_SECONDS[stationCode] || DEFAULT_PREP_SECONDS.pack
    });
  });
  return payloads;
};

const ensureStationTasksForOrder = async (orderInput, options = {}) => {
  const transaction = options.transaction;
  const orderId = typeof orderInput === "number" ? orderInput : orderInput?.order_id || orderInput?.Order?.order_id;
  if (!orderId) return [];

  const existingCount = await StationTask.count({ where: { order_id: orderId }, transaction });
  if (existingCount > 0) {
    return StationTask.findAll({ where: { order_id: orderId }, transaction });
  }

  const orderItems = await OrderItem.findAll({
    where: { order_id: orderId },
    include: [
      {
        model: Product,
        attributes: ["product_id", "name", "food_type", "prep_station_code"]
      }
    ],
    transaction
  });

  if (!orderItems.length) return [];

  const codes = orderItems.map((item) => inferStationCodeFromProduct(item.Product));
  const stationMap = await ensureStationsExist(codes, { transaction });

  const payloads = buildTaskPayloads(orderItems, stationMap);
  if (!payloads.length) return [];

  return StationTask.bulkCreate(payloads, { transaction });
};

export { ensureStationTasksForOrder, sanitizeStationCode, inferStationCodeFromProduct };
