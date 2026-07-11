import prisma from "../config/prismaClient.js";

// ── CHECKOUT — THE TPS CORE ────────────────────────────
// This is where BEGIN, FOR UPDATE, COMMIT, ROLLBACK happens
export const checkout = async (req, res) => {
  const { items, paymentMethod, deliveryType } = req.body;
  // items = [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }]

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Order items are required",
    });
  }

  if (!paymentMethod || !["CASH", "GCASH"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Payment method must be CASH or GCASH",
    });
  }

  if (!deliveryType || !["PICKUP", "DELIVERY"].includes(deliveryType)) {
    return res.status(400).json({
      success: false,
      message: "Delivery type must be PICKUP or DELIVERY",
    });
  }

  // ── THE ATOMIC TRANSACTION ─────────────────────────
  // Everything inside here is ONE atomic unit
  // Either ALL succeed → COMMIT
  // Or ANY fails → automatic ROLLBACK
  const order = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const validatedItems = [];

    // Process each item in the order
    for (const item of items) {
      const { productId, quantity } = item;

      if (!productId || !quantity || quantity < 1) {
        throw new Error("Invalid item — productId and quantity are required");
      }

      // ── STEP 1: LOCK THE ROW ─────────────────────
      // SELECT FOR UPDATE locks this specific product row
      // No other transaction can touch this row
      // until our transaction commits or rolls back
      // This is what prevents double-selling
      const lockedProduct = await tx.$queryRaw`
        SELECT id, name, stock, price
        FROM products
        WHERE id = ${parseInt(productId)}
        AND "isActive" = true
        FOR UPDATE
      `;

      // Product not found
      if (!lockedProduct || lockedProduct.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      const product = lockedProduct[0];

      // ── STEP 2: CHECK STOCK ──────────────────────
      // If stock is insufficient → throw error
      // Throwing inside $transaction = automatic ROLLBACK
      // Lock is released, nothing is saved
      if (product.stock < quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}". ` +
            `Available: ${product.stock}, Requested: ${quantity}`,
        );
      }

      // ── STEP 3: DEDUCT STOCK ─────────────────────
      // Atomic decrement — safe even under concurrent requests
      // Because the row is locked — no race condition possible
      await tx.product.update({
        where: { id: parseInt(productId) },
        data: { stock: { decrement: quantity } },
      });

      // Calculate item total
      const itemTotal = parseFloat(product.price) * quantity;
      totalAmount += itemTotal;

      validatedItems.push({
        productId: parseInt(productId),
        quantity,
        price: parseFloat(product.price),
      });
    }

    // ── STEP 4: CREATE ORDER RECORD ───────────────
    // Only reached if ALL items passed stock check
    const newOrder = await tx.order.create({
      data: {
        buyerId: req.user.id,
        status: "RESERVED",
        paymentMethod,
        paymentStatus: paymentMethod === "CASH" ? "PENDING" : "PENDING",
        deliveryType,
        totalAmount,
      },
    });

    // ── STEP 5: CREATE ORDER ITEMS ────────────────
    // Link each product to the order
    await tx.orderItem.createMany({
      data: validatedItems.map((item) => ({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // ── STEP 6: RETURN ORDER ──────────────────────
    // All steps passed → Prisma auto-COMMITS
    // Return the complete order with items
    return await tx.order.findUnique({
      where: { id: newOrder.id },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }); // ← If ANY step above threw an error → auto ROLLBACK

  // ── AFTER COMMIT ───────────────────────────────
  // PayMongo is called OUTSIDE the transaction
  // Because external API calls should never be inside
  // an atomic transaction — network failures would
  // cause unnecessary rollbacks
  if (order.paymentMethod === "GCASH") {
    // We will add PayMongo here in Phase 5
    return res.status(201).json({
      success: true,
      message: "Order placed. Redirecting to GCash payment...",
      data: order,
      paymentUrl: null, // Phase 5 will fill this
    });
  }

  // Cash payment — order is complete
  res.status(201).json({
    success: true,
    message: "Order placed successfully. Please prepare your cash payment.",
    data: order,
  });
};

// ── GET MY ORDERS — BUYER ──────────────────────────────
export const getMyOrders = async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { buyerId: req.user.id },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── GET SINGLE ORDER ───────────────────────────────────
export const getOrder = async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id: parseInt(id) },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      },
      buyer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  // Buyer can only view their own orders
  if (order.buyerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this order",
    });
  }

  res.status(200).json({
    success: true,
    data: order,
  });
};

// ── GET ORDERS RECEIVED — SELLER ───────────────────────
// Seller sees orders containing their products
export const getSellerOrders = async (req, res) => {
  const orders = await prisma.order.findMany({
    where: {
      orderItems: {
        some: {
          product: {
            sellerId: req.user.id,
          },
        },
      },
    },
    include: {
      orderItems: {
        where: {
          product: {
            sellerId: req.user.id,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              price: true,
            },
          },
        },
      },
      buyer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── UPDATE ORDER STATUS — SELLER ───────────────────────
// Seller updates order status — processing, fulfilled, cancelled
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["PROCESSING", "FULFILLED", "CANCELLED"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be PROCESSING, FULFILLED, or CANCELLED",
    });
  }

  const order = await prisma.order.findUnique({
    where: { id: parseInt(id) },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  // Verify this order contains seller's products
  const isSellerOrder = order.orderItems.some(
    (item) => item.product.sellerId === req.user.id,
  );

  if (!isSellerOrder) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this order",
    });
  }

  // If cancelled — restore the stock
  // This is important — pag na-cancel ang order
  // kailangan ibalik ang stock para maibili ng iba
  if (status === "CANCELLED") {
    await prisma.$transaction(async (tx) => {
      // Restore stock for each item
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Update order status
      await tx.order.update({
        where: { id: parseInt(id) },
        data: { status: "CANCELLED" },
      });
    });
  } else {
    await prisma.order.update({
      where: { id: parseInt(id) },
      data: { status },
    });
  }

  const updatedOrder = await prisma.order.findUnique({
    where: { id: parseInt(id) },
    include: {
      orderItems: {
        include: {
          product: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    message: `Order status updated to ${status}`,
    data: updatedOrder,
  });
};
