import { Router } from "express";
import {
  getPendingVerifications,
  verifyUser,
  getAllUsers,
  getUser,
  suspendUser,
  getAllProducts,
  removeProduct,
  getAllOrders,
  addBarangay,
  toggleBarangay,
  addCategory,
  toggleCategory,
} from "../controllers/admin.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import {
  validateVerifyUser,
  validateAddBarangay,
  validateAddCategory,
  validateIdParam,
} from "../middleware/validate.middleware.js";

const adminRoutes = Router();

// ── ALL ADMIN ROUTES REQUIRE ───────────────────────────
// protect    → must be logged in (valid JWT token)
// authorize  → must have ADMIN role
// Applied to every route in this file

// ── USER MANAGEMENT ────────────────────────────────────
// Get all users — with optional role and status filters
adminRoutes.get("/users", protect, authorize("ADMIN"), getAllUsers);

// Get single user details with their documents
adminRoutes.get(
  "/users/:id",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  getUser,
);

// Get all pending verification requests
adminRoutes.get(
  "/users/verifications/pending",
  protect,
  authorize("ADMIN"),
  getPendingVerifications,
);

// ── APPROVE or REJECT a USER REGISTRATION ───────────────────────────────────
// Body: { action: "approve" | "reject", barangayId: number }
adminRoutes.put(
  "/users/:id/verify",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  validateVerifyUser,
  verifyUser,
);

// Suspend a user account
adminRoutes.put(
  "/users/:id/suspend",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  suspendUser,
);

// ── PRODUCT MODERATION ─────────────────────────────────
// Get all products — including inactive ones
adminRoutes.get("/products", protect, authorize("ADMIN"), getAllProducts);

// Remove a product listing — body: { reason: string }
adminRoutes.put(
  "/products/:id/remove",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  removeProduct,
);

// ── ORDER MONITORING ───────────────────────────────────
// Get all orders across the entire platform
adminRoutes.get("/orders", protect, authorize("ADMIN"), getAllOrders);

// ── BARANGAY MANAGEMENT ────────────────────────────────
// Add new barangay — body: { name: string, city: string }
adminRoutes.post(
  "/barangays",
  protect,
  authorize("ADMIN"),
  validateAddBarangay,
  addBarangay,
);

// Toggle barangay active status
adminRoutes.put(
  "/barangays/:id/toggle",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  toggleBarangay,
);

// ── CATEGORY MANAGEMENT ────────────────────────────────
// Add new category — body: { name: string }
adminRoutes.post(
  "/categories",
  protect,
  authorize("ADMIN"),
  validateAddCategory,
  addCategory,
);

// Toggle category active status
adminRoutes.put(
  "/categories/:id/toggle",
  protect,
  authorize("ADMIN"),
  validateIdParam,
  toggleCategory,
);

export default adminRoutes;
