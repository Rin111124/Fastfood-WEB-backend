import express from "express";
import {
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
  updatePaymentStatusHandler,
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
  listBackupsHandler,
  createBackupHandler,
  restoreBackupHandler,
  listShiftsHandler,
  scheduleShiftHandler
} from "./admin.api.controller.js";
import { requireRoles } from "../../middleware/authMiddleware.js";
import { createMemoryImageUploader } from "../../middleware/uploadMiddleware.js";
import { handleMulterError, handleGeneralError } from "../../middleware/errorMiddleware.js";

const router = express.Router();

// Apply error handling middleware
router.use(handleMulterError);
router.use(handleGeneralError);

// Staff & admin order creation endpoint (POS)
router.post("/orders", requireRoles("staff", "admin"), createStaffOrderHandler);

router.use(requireRoles("admin"));

const uploadProductImage = createMemoryImageUploader("image");
// Configure news image upload with limits
const uploadNewsImage = createMemoryImageUploader("image", {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

// dashboard & reports
router.get("/dashboard", dashboardHandler);
router.get("/reports/overview", reportOverviewHandler);

// users
router.get("/users", listUsersHandler);
router.post("/users", createUserHandler);
router.put("/users/:userId", updateUserHandler);
router.patch("/users/:userId/status", setUserStatusHandler);
router.delete("/users/:userId", deleteUserHandler);
router.post("/users/:userId/restore", restoreUserHandler);
router.post("/users/:userId/reset-password", resetPasswordHandler);
router.post("/users/:userId/send-reset-email", sendResetEmailHandler);
router.get("/staff", listStaffHandler);

// categories
router.get("/categories", listCategoriesHandler);
router.post("/categories", createCategoryHandler);
router.put("/categories/:categoryId", updateCategoryHandler);
router.delete("/categories/:categoryId", deleteCategoryHandler);

// products & options
router.get("/products", listProductsHandler);
router.post("/products", uploadProductImage, createProductHandler);
router.put("/products/:productId", uploadProductImage, updateProductHandler);
router.patch("/products/:productId/availability", toggleProductHandler);
router.post("/products/:productId/toggle", toggleProductHandler);
router.delete("/products/:productId", deleteProductHandler);

// news
router.get("/news", listNewsHandler);
router.post("/news", uploadNewsImage, createNewsHandler);
router.put("/news/:newsId", uploadNewsImage, updateNewsHandler);
router.delete("/news/:newsId", deleteNewsHandler);

router.get("/product-options", listProductOptionsHandler);
router.post("/product-options", createProductOptionHandler);
router.put("/product-options/:optionId", updateProductOptionHandler);
router.patch("/product-options/:optionId/availability", toggleProductOptionAvailabilityHandler);
router.delete("/product-options/:optionId", deleteProductOptionHandler);

// orders
router.get("/orders", listOrdersHandler);
router.get("/payments", listPaymentsHandler);
router.patch("/payments/:paymentId/status", updatePaymentStatusHandler);
router.post("/orders/:orderId/assign", assignOrderHandler);
router.patch("/orders/:orderId/status", updateOrderStatusHandler);
router.post("/orders/:orderId/refund", refundOrderHandler);

// promotions
router.get("/promotions", listPromotionsHandler);
router.post("/promotions", createPromotionHandler);
router.put("/promotions/:promoId", updatePromotionHandler);
router.post("/promotions/:promoId/toggle", togglePromotionHandler);

// system settings & logs
router.get("/settings", listSettingsHandler);
router.post("/settings", upsertSettingsHandler);
router.get("/logs", listLogsHandler);

// inventory
router.get("/inventory", listInventoryHandler);
router.post("/inventory", upsertInventoryHandler);

// backups
router.get("/backups", listBackupsHandler);
router.post("/backups", createBackupHandler);
router.post("/backups/:fileName/restore", restoreBackupHandler);

// staff shifts
router.get("/shifts", listShiftsHandler);
router.post("/shifts", scheduleShiftHandler);

export default router;
