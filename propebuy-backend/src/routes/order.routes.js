import { Router } from "express";
import {
  checkout,
  getMyOrders,
  getOrder,
  getSellerOrders,
  updateOrderStatus,
  handlePaymongoWebhook,
  checkPaymentStatus,
} from "../controllers/order.controller.js";
import { validateCartItem } from "../controllers/cart.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const orderRoutes = Router();

// ── PAYMONGO WEBHOOK ───────────────────────────────────
// No auth needed — PayMongo calls this directly
// Must be registered in PayMongo dashboard as webhook URL
orderRoutes.post("/webhook/paymongo", handlePaymongoWebhook);

// ── PROTECTED ROUTES — SELLER & BUYER ────────────────────

// ── CART VALIDATION ────────────────────────────────────
orderRoutes.post(
  "/cart/validate",
  protect,
  authorize("BUYER"),
  validateCartItem,
);

// ── CHECKOUT — TPS ─────────────────────────────────────
orderRoutes.post("/checkout", protect, authorize("BUYER"), checkout);

// ── BUYER ORDER ROUTES ─────────────────────────────────
orderRoutes.get("/my-orders", protect, authorize("BUYER"), getMyOrders);

// Check GCash payment status — fallback for failed webhooks
orderRoutes.get(
  "/:id/payment-status",
  protect,
  authorize("BUYER"),
  checkPaymentStatus,
);

orderRoutes.get("/:id", protect, getOrder);

// ── SELLER ORDER ROUTES ────────────────────────────────
orderRoutes.get(
  "/seller/received",
  protect,
  authorize("SELLER"),
  getSellerOrders,
);

orderRoutes.put("/:id/status", protect, authorize("SELLER"), updateOrderStatus);

export default orderRoutes;
