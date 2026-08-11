import prisma from "../config/prismaClient.js";
import { notifyOrderStatus } from "../utils/notification.helper.js";

// ── GET ALL PENDING VERIFICATIONS ──────────────────────
// Returns all users with PENDING account status
// These are users who registered but not yet reviewed by admin
export const getPendingVerifications = async (req, res) => {
  // Find all users waiting for verification
  // Include their barangay info for display
  const pendingUsers = await prisma.user.findMany({
    where: {
      // Only get users with PENDING status
      accountStatus: "PENDING",
    },
    select: {
      // Only return safe fields — never return password
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      idDocumentUrl: true, // URL of uploaded government ID
      certDocumentUrl: true, // URL of uploaded barangay certificate
      createdAt: true,
      barangay: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    // Show newest registrations first
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: pendingUsers.length,
    data: pendingUsers,
  });
};

// ── VERIFY USER — APPROVE OR REJECT ───────────────────
// Admin reviews a user's documents and approves or rejects
// userId — the user being verified
// action — "approve" or "reject"
// barangayId — required when approving — assigns user to barangay
export const verifyUser = async (req, res) => {
  const { id } = req.params;
  const { action, barangayId } = req.body;

  // Validate action — must be approve or reject
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be approve or reject",
    });
  }

  // Find the user being verified
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
  });

  // User must exist
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Can only verify users who are still PENDING
  // Prevents double-verifying already processed users
  if (user.accountStatus !== "PENDING") {
    return res.status(400).json({
      success: false,
      message: "User has already been verified or rejected",
    });
  }

  // When approving — barangayId is required
  // This assigns the user to their verified barangay
  if (action === "approve" && !barangayId) {
    return res.status(400).json({
      success: false,
      message: "barangayId is required when approving a user",
    });
  }

  // Build update data based on action
  const updateData =
    action === "approve"
      ? {
          // Approve — set status to VERIFIED and assign barangay
          accountStatus: "VERIFIED",
          barangayId: parseInt(barangayId),
        }
      : {
          // Reject — set status to REJECTED only
          accountStatus: "REJECTED",
        };

  // Update the user's account status
  const updatedUser = await prisma.user.update({
    where: { id: parseInt(id) },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      barangayId: true,
    },
  });

  res.status(200).json({
    success: true,
    message: `User ${action === "approve" ? "approved" : "rejected"} successfully`,
    data: updatedUser,
  });
};

// ── GET ALL USERS ──────────────────────────────────────
// Admin views all users on the platform
// Supports filtering by role and status
export const getAllUsers = async (req, res) => {
  // Extract optional filter params from query string
  // Example: /api/admin/users?role=SELLER&status=PENDING
  const { role, status } = req.query;

  // Build where filter dynamically
  // Only add filter if the query param was provided
  const where = {};
  if (role) where.role = role;
  if (status) where.accountStatus = status;

  const users = await prisma.user.findMany({
    where,
    select: {
      // Never return password — even to admin
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      createdAt: true,
      barangay: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
};

// ── GET SINGLE USER ────────────────────────────────────
// Admin views details of one specific user
// Including their uploaded verification documents
export const getUser = async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      idDocumentUrl: true,
      certDocumentUrl: true,
      createdAt: true,
      barangay: {
        select: { id: true, name: true },
      },
      // Include user's products if they are a seller
      products: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          isActive: true,
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.status(200).json({
    success: true,
    data: user,
  });
};

// ── SUSPEND USER ───────────────────────────────────────
// Admin suspends a user account by setting status to REJECTED
// Used for fraud, policy violations, etc.
export const suspendUser = async (req, res) => {
  const { id } = req.params;

  // Cannot suspend yourself — prevents admin lockout
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({
      success: false,
      message: "You cannot suspend your own account",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Cannot suspend another admin
  if (user.role === "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Cannot suspend an admin account",
    });
  }

  // Set account status to REJECTED — user can no longer access platform
  const suspendedUser = await prisma.user.update({
    where: { id: parseInt(id) },
    data: { accountStatus: "REJECTED" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
    },
  });

  res.status(200).json({
    success: true,
    message: "User suspended successfully",
    data: suspendedUser,
  });
};

// ── GET ALL PRODUCTS — ADMIN ───────────────────────────
// Admin sees ALL products — including inactive ones
// Regular product route only shows active products to buyers
export const getAllProducts = async (req, res) => {
  // Extract filter params
  const { barangayId, categoryId, isActive } = req.query;

  // Build filter — admin can filter by barangay, category, or active status
  const where = {};
  if (barangayId) where.barangayId = parseInt(barangayId);
  if (categoryId) where.categoryId = parseInt(categoryId);

  // isActive filter — "true" string from query param to boolean
  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          accountStatus: true,
        },
      },
      barangay: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
};

// ── REMOVE PRODUCT LISTING — ADMIN ────────────────────
// Admin can remove any product that violates platform policies
// Uses soft delete — sets isActive to false
export const removeProduct = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Reason is required — admin must provide why product is removed
  // Useful for documentation and future dispute resolution
  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "Reason for removal is required",
    });
  }

  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
    include: {
      // Include seller info to notify them
      seller: { select: { id: true, name: true } },
    },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  // Soft delete the product — sets isActive to false
  // Product remains in database for order history purposes
  await prisma.product.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  res.status(200).json({
    success: true,
    message: "Product removed from platform successfully",
    data: {
      productId: product.id,
      productName: product.name,
      seller: product.seller.name,
      reason,
    },
  });
};

// ── GET ALL ORDERS — ADMIN ─────────────────────────────
// Admin sees ALL orders across the entire platform
// Supports filtering by status and payment method
export const getAllOrders = async (req, res) => {
  // Extract optional filter params
  const { status, paymentMethod, paymentStatus } = req.query;

  // Build where filter dynamically
  const where = {};
  if (status) where.status = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const orders = await prisma.order.findMany({
    where,
    include: {
      // Include buyer info
      buyer: {
        select: { id: true, name: true, email: true },
      },
      // Include all order items with product and seller info
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              seller: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
    // Most recent orders first
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── MANAGE BARANGAYS ───────────────────────────────────
// Admin adds a new barangay to the platform
// New barangay becomes available in the dropdown filter
export const addBarangay = async (req, res) => {
  const { name, city } = req.body;

  // Name is required for barangay creation
  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Barangay name is required",
    });
  }

  // Check if barangay already exists — prevent duplicates
  const existing = await prisma.barangay.findUnique({
    where: { name },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Barangay already exists",
    });
  }

  // Create the new barangay
  const barangay = await prisma.barangay.create({
    data: {
      name,
      // Default to Muntinlupa City if no city provided
      city: city || "Muntinlupa City",
      isActive: true,
    },
  });

  res.status(201).json({
    success: true,
    message: "Barangay added successfully",
    data: barangay,
  });
};

// ── TOGGLE BARANGAY STATUS ─────────────────────────────
// Admin enables or disables a barangay
// Disabled barangays won't appear in the dropdown filter
export const toggleBarangay = async (req, res) => {
  const { id } = req.params;

  // Find the barangay
  const barangay = await prisma.barangay.findUnique({
    where: { id: parseInt(id) },
  });

  if (!barangay) {
    return res.status(404).json({
      success: false,
      message: "Barangay not found",
    });
  }

  // Toggle the isActive status — if true make false, if false make true
  const updated = await prisma.barangay.update({
    where: { id: parseInt(id) },
    data: {
      // ! operator flips boolean — true becomes false, false becomes true
      isActive: !barangay.isActive,
    },
  });

  res.status(200).json({
    success: true,
    message: `Barangay ${updated.isActive ? "enabled" : "disabled"} successfully`,
    data: updated,
  });
};

// ── MANAGE CATEGORIES ──────────────────────────────────
// Admin adds a new product category to the platform
export const addCategory = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  // Check if category already exists
  const existing = await prisma.category.findUnique({
    where: { name },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Category already exists",
    });
  }

  const category = await prisma.category.create({
    data: {
      name,
      isActive: true,
    },
  });

  res.status(201).json({
    success: true,
    message: "Category added successfully",
    data: category,
  });
};

// ── TOGGLE CATEGORY STATUS ─────────────────────────────
// Admin enables or disables a product category
export const toggleCategory = async (req, res) => {
  const { id } = req.params;

  const category = await prisma.category.findUnique({
    where: { id: parseInt(id) },
  });

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  // Toggle isActive — same pattern as barangay toggle
  const updated = await prisma.category.update({
    where: { id: parseInt(id) },
    data: { isActive: !category.isActive },
  });

  res.status(200).json({
    success: true,
    message: `Category ${updated.isActive ? "enabled" : "disabled"} successfully`,
    data: updated,
  });
};
