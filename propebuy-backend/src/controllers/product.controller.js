import prisma from "../config/prismaClient.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// ── CREATE PRODUCT ─────────────────────────────────────
// Seller only
export const createProduct = async (req, res) => {
  const { name, description, price, stock, categoryId } = req.body;

  // Validate required fields
  if (!name || !price || !stock || !categoryId) {
    return res.status(400).json({
      success: false,
      message: "Name, price, stock, and category are required",
    });
  }

  // Seller must be verified before listing products
  if (req.user.accountStatus !== "VERIFIED") {
    return res.status(403).json({
      success: false,
      message: "Your account must be verified before listing products",
    });
  }

  // Seller must have a barangay assigned
  if (!req.user.barangayId) {
    return res.status(400).json({
      success: false,
      message: "Your account must be assigned to a barangay",
    });
  }

  // Upload product image if provided
  let imageUrl = null;
  if (req.file) {
    const upload = await uploadToCloudinary(req.file.buffer, "products");
    imageUrl = upload.secure_url;
  }

  const product = await prisma.product.create({
    data: {
      sellerId: req.user.id,
      barangayId: req.user.barangayId,
      categoryId: parseInt(categoryId),
      name,
      description: description || null,
      price: parseFloat(price),
      stock: parseInt(stock),
      imageUrl,
    },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          accountStatus: true,
        },
      },
      barangay: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  res.status(201).json({
    success: true,
    message: "Product created successfully",
    data: product,
  });
};

// ── GET ALL PRODUCTS ───────────────────────────────────
// Public — buyers can browse with filters
export const getProducts = async (req, res) => {
  // Extract query params for filtering
  // Example: /api/products?barangayId=5&categoryId=1&search=rice
  const { barangayId, categoryId, search } = req.query;

  // Build filter object dynamically
  // Only add filters that are actually provided
  const where = {
    isActive: true,
    stock: { gt: 0 }, // only show products with stock
  };

  if (barangayId) {
    where.barangayId = parseInt(barangayId);
  }

  if (categoryId) {
    where.categoryId = parseInt(categoryId);
  }

  if (search) {
    where.name = {
      contains: search,
      mode: "insensitive", // case-insensitive search
    };
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          accountStatus: true,
        },
      },
      barangay: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
};

// ── GET SINGLE PRODUCT ─────────────────────────────────
// Public — view product details
export const getProduct = async (req, res) => {
  const { id } = req.params;

  const product = await prisma.product.findUnique({
    where: {
      id: parseInt(id),
      isActive: true,
    },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          accountStatus: true,
          barangay: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      barangay: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  res.status(200).json({
    success: true,
    data: product,
  });
};

// ── GET MY PRODUCTS ────────────────────────────────────
// Seller only — view own product listings
export const getMyProducts = async (req, res) => {
  const products = await prisma.product.findMany({
    where: {
      sellerId: req.user.id,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      barangay: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
};

// ── UPDATE PRODUCT ─────────────────────────────────────
// Seller only — edit own product
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock, categoryId } = req.body;

  // Check if product exists and belongs to this seller
  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  // Make sure seller can only edit their own products
  if (product.sellerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to edit this product",
    });
  }

  // Upload new image if provided
  let imageUrl = product.imageUrl;
  if (req.file) {
    const upload = await uploadToCloudinary(req.file.buffer, "products");
    imageUrl = upload.secure_url;
  }

  const updatedProduct = await prisma.product.update({
    where: { id: parseInt(id) },
    data: {
      name: name || product.name,
      description: description || product.description,
      price: price ? parseFloat(price) : product.price,
      stock: stock ? parseInt(stock) : product.stock,
      categoryId: categoryId ? parseInt(categoryId) : product.categoryId,
      imageUrl,
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
      barangay: {
        select: { id: true, name: true },
      },
    },
  });

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: updatedProduct,
  });
};

// ── DELETE PRODUCT ─────────────────────────────────────
// Seller only — soft delete own product
export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  // Check if product exists and belongs to this seller
  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  if (product.sellerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to delete this product",
    });
  }

  // Soft delete — set isActive to false
  // Hindi natin talaga dinelete para hindi masira ang order history
  await prisma.product.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
};

// ── GET ALL BARANGAYS ──────────────────────────────────
// Public — for barangay dropdown filter
export const getBarangays = async (req, res) => {
  const barangays = await prisma.barangay.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    data: barangays,
  });
};

// ── GET ALL CATEGORIES ─────────────────────────────────
// Public — for category filter
export const getCategories = async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    data: categories,
  });
};
