import { Router } from "express";
import {
  checkout,
  getMyOrders,
  getOrder,
  getSellerOrders,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import { validateCartItem } from "../controllers/cart.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const orderRoutes = Router();

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
