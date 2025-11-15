"use strict";

import express from "express";
import { ensureAdmin } from "../../middleware/sessionAuth.js";
import {
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
} from "./admin.web.controller.js";

const router = express.Router();

router.use(ensureAdmin);

router.get("/", adminDashboardPage);

router.get("/users", adminUsersPage);
router.post("/users", createUserHandler);
router.post("/users/:userId/update", updateUserHandler);
router.post("/users/:userId/status", setUserStatusHandler);
router.post("/users/:userId/delete", deleteUserHandler);
router.post("/users/:userId/restore", restoreUserHandler);
router.post("/users/:userId/reset-password", resetPasswordHandler);
router.post("/users/:userId/send-reset-email", sendResetEmailHandler);

router.get("/foods", adminFoodPage);
router.post("/foods", createProductHandler);
router.post("/foods/:productId/update", updateProductHandler);
router.post("/foods/:productId/toggle", toggleProductHandler);
router.post("/foods/:productId/delete", deleteProductHandler);

router.post("/categories", createCategoryHandler);
router.post("/categories/:categoryId/update", updateCategoryHandler);
router.post("/categories/:categoryId/delete", deleteCategoryHandler);

router.post("/options", createOptionHandler);
router.post("/options/:optionId/update", updateOptionHandler);
router.post("/options/:optionId/delete", deleteOptionHandler);

router.get("/orders", adminOrdersPage);
router.post("/orders/:orderId/assign", assignOrderHandler);
router.post("/orders/:orderId/status", updateOrderStatusHandler);
router.post("/orders/:orderId/refund", refundOrderHandler);

router.get("/promotions", adminPromotionsPage);
router.post("/promotions", createPromotionHandler);
router.post("/promotions/:promoId/update", updatePromotionHandler);
router.post("/promotions/:promoId/toggle", togglePromotionHandler);

router.get("/reports", adminReportsPage);

router.get("/settings", adminSettingsPage);
router.post("/settings/update", updateSettingsHandler);
router.post("/settings/backup", createBackupHandler);
router.post("/settings/restore", restoreBackupHandler);

router.get("/logs", adminLogsPage);

router.get("/inventory", adminInventoryPage);
router.post("/inventory", upsertInventoryHandler);

router.get("/shifts", adminShiftsPage);
router.post("/shifts", scheduleShiftHandler);

const initAdminRoutes = (app) => app.use("/admin", router);

export default initAdminRoutes;
