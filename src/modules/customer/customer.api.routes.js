import express from "express";
import {
  listProductsHandler,
  listNewsHandler,
  customerDashboardHandler,
  listOrdersHandler,
  getOrderHandler,
  createOrderHandler,
  cancelOrderHandler,
  getProfileHandler,
  createProfileHandler,
  updateProfileHandler,
  deleteProfileHandler,
  listSupportMessagesForMeHandler,
  createSupportMessageHandler,
  getMyConversationMessagesHandler,
  postMyConversationMessageHandler,
  // cart
  getCartHandler,
  addCartItemHandler,
  updateCartItemHandler,
  removeCartItemHandler,
  clearCartHandler
} from "./customer.api.controller.js";
import { requireRoles } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/products", listProductsHandler);
router.get("/news", listNewsHandler);
router.get("/dashboard", requireRoles("customer", "admin"), customerDashboardHandler);

router.use(requireRoles("customer", "admin"));

router.get("/me", getProfileHandler);
router.post("/me", createProfileHandler);
router.patch("/me", updateProfileHandler);
router.delete("/me", deleteProfileHandler);

router.get("/orders", listOrdersHandler);
router.post("/orders", createOrderHandler);
router.get("/orders/:orderId", getOrderHandler);
router.post("/orders/:orderId/cancel", cancelOrderHandler);

// Support messages (authenticated)
router.get("/support/messages", listSupportMessagesForMeHandler);
router.post("/support/messages", createSupportMessageHandler);
router.get("/support/conversation/messages", getMyConversationMessagesHandler);
router.post("/support/conversation/messages", postMyConversationMessageHandler);

// Cart endpoints (authenticated)
router.get("/cart", getCartHandler);
router.post("/cart/items", addCartItemHandler);
router.patch("/cart/items/:productId", updateCartItemHandler);
router.delete("/cart/items/:productId", removeCartItemHandler);
router.post("/cart/clear", clearCartHandler);

export default router;


