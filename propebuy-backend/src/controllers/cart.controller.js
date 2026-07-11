import prisma from "../config/prismaClient.js";

// In-memory cart is handled on the frontend
// Backend cart validation happens at checkout
// But we need these endpoints for cart item validation

// ── VALIDATE CART ITEM ─────────────────────────────────
// Check if product exists and has enough stock
// Called before buyer adds to cart on frontend
export const validateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({
      success: false,
      message: "Product ID and quantity are required",
    });
  }

  const product = await prisma.product.findUnique({
    where: {
      id: parseInt(productId),
      isActive: true,
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
        select: { id: true, name: true },
      },
      category: {
        select: { id: true, name: true },
      },
    },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  if (product.stock < parseInt(quantity)) {
    return res.status(400).json({
      success: false,
      message: `Insufficient stock. Only ${product.stock} items available`,
    });
  }

  res.status(200).json({
    success: true,
    message: "Product is available",
    data: product,
  });
};
