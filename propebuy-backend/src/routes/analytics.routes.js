import { Router } from "express";
import {
  getSellerAnalytics,
  getPlatformAnalytics,
} from "../controllers/analytics.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const analyticsRoutes = Router();

// ── SELLER ANALYTICS ───────────────────────────────────
// Seller views their own sales performance dashboard
analyticsRoutes.get(
  "/seller",
  protect,
  authorize("SELLER"),
  getSellerAnalytics,
);

// ── PLATFORM ANALYTICS — ADMIN ONLY ───────────────────
// Admin views overall platform statistics
analyticsRoutes.get(
  "/platform",
  protect,
  authorize("ADMIN"),
  getPlatformAnalytics,
);

export default analyticsRoutes;
