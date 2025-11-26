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
import { validateBody, validateParams } from "../../middleware/validate.js";
import {
  assignOrderSchema,
  categoryIdParamSchema,
  createUserSchema,
  inventoryUpsertSchema,
  newsIdParamSchema,
  optionIdParamSchema,
  orderIdParamSchema,
  paymentIdParamSchema,
  productBaseSchema,
  productIdParamSchema,
  productUpdateSchema,
  promoIdParamSchema,
  promotionBaseSchema,
  promotionUpdateSchema,
  toggleProductSchema,
  updateUserSchema,
  userIdParamSchema,
  userStatusSchema,
  orderStatusSchema,
  paymentStatusSchema
} from "./admin.validation.js";

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
router.post("/users", validateBody(createUserSchema), createUserHandler);
router.put(
  "/users/:userId",
  validateParams(userIdParamSchema),
  validateBody(updateUserSchema),
  updateUserHandler
);
router.patch(
  "/users/:userId/status",
  validateParams(userIdParamSchema),
  validateBody(userStatusSchema),
  setUserStatusHandler
);
router.delete("/users/:userId", validateParams(userIdParamSchema), deleteUserHandler);
router.post("/users/:userId/restore", validateParams(userIdParamSchema), restoreUserHandler);
router.post("/users/:userId/reset-password", validateParams(userIdParamSchema), resetPasswordHandler);
router.post(
  "/users/:userId/send-reset-email",
  validateParams(userIdParamSchema),
  sendResetEmailHandler
);
router.get("/staff", listStaffHandler);

// categories
router.get("/categories", listCategoriesHandler);
router.post("/categories", createCategoryHandler);
router.put("/categories/:categoryId", validateParams(categoryIdParamSchema), updateCategoryHandler);
router.delete("/categories/:categoryId", validateParams(categoryIdParamSchema), deleteCategoryHandler);

// products & options
router.get("/products", listProductsHandler);
router.post(
  "/products",
  uploadProductImage,
  validateBody(productBaseSchema),
  createProductHandler
);
router.put(
  "/products/:productId",
  uploadProductImage,
  validateParams(productIdParamSchema),
  validateBody(productUpdateSchema),
  updateProductHandler
);
router.patch(
  "/products/:productId/availability",
  validateParams(productIdParamSchema),
  validateBody(toggleProductSchema),
  toggleProductHandler
);
router.post(
  "/products/:productId/toggle",
  validateParams(productIdParamSchema),
  validateBody(toggleProductSchema),
  toggleProductHandler
);
router.delete("/products/:productId", validateParams(productIdParamSchema), deleteProductHandler);

// news
router.get("/news", listNewsHandler);
router.post("/news", uploadNewsImage, createNewsHandler);
router.put("/news/:newsId", uploadNewsImage, validateParams(newsIdParamSchema), updateNewsHandler);
router.delete("/news/:newsId", validateParams(newsIdParamSchema), deleteNewsHandler);

router.get("/product-options", listProductOptionsHandler);
router.post("/product-options", createProductOptionHandler);
router.put(
  "/product-options/:optionId",
  validateParams(optionIdParamSchema),
  updateProductOptionHandler
);
router.patch(
  "/product-options/:optionId/availability",
  validateParams(optionIdParamSchema),
  toggleProductOptionAvailabilityHandler
);
router.delete(
  "/product-options/:optionId",
  validateParams(optionIdParamSchema),
  deleteProductOptionHandler
);

// orders
router.get("/orders", listOrdersHandler);
router.get("/payments", listPaymentsHandler);
router.patch(
  "/payments/:paymentId/status",
  validateParams(paymentIdParamSchema),
  validateBody(paymentStatusSchema),
  updatePaymentStatusHandler
);
router.post(
  "/orders/:orderId/assign",
  validateParams(orderIdParamSchema),
  validateBody(assignOrderSchema),
  assignOrderHandler
);
router.patch(
  "/orders/:orderId/status",
  validateParams(orderIdParamSchema),
  validateBody(orderStatusSchema),
  updateOrderStatusHandler
);
router.post("/orders/:orderId/refund", validateParams(orderIdParamSchema), refundOrderHandler);

// promotions
router.get("/promotions", listPromotionsHandler);
router.post("/promotions", validateBody(promotionBaseSchema), createPromotionHandler);
router.put(
  "/promotions/:promoId",
  validateParams(promoIdParamSchema),
  validateBody(promotionUpdateSchema),
  updatePromotionHandler
);
router.post("/promotions/:promoId/toggle", togglePromotionHandler);

// system settings & logs
router.get("/settings", listSettingsHandler);
router.post("/settings", upsertSettingsHandler);
router.get("/logs", listLogsHandler);

// inventory
router.get("/inventory", listInventoryHandler);
router.post("/inventory", validateBody(inventoryUpsertSchema), upsertInventoryHandler);

// backups
router.get("/backups", listBackupsHandler);
router.post("/backups", createBackupHandler);
router.post("/backups/:fileName/restore", restoreBackupHandler);

// staff shifts
router.get("/shifts", listShiftsHandler);
router.post("/shifts", scheduleShiftHandler);

export default router;
