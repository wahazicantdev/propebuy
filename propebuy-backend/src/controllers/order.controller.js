import prisma from "../config/prismaClient.js";
import {
  createGCashPaymentLink,
  verifyPaymentStatus,
} from "../utils/paymongo.helper.js";

// ── CHECKOUT — THE TPS CORE ────────────────────────────
// Handles atomic order processing with optional GCash payment
export const checkout = async (req, res) => {
  const { items, paymentMethod, deliveryType } = req.body;

  // Validate required fields before opening transaction
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

  // ── ATOMIC TRANSACTION ─────────────────────────────
  // All database operations here are ONE unit
  // Any failure = automatic ROLLBACK
  const order = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const validatedItems = [];

    // Process each item in the order
    for (const item of items) {
      const { productId, quantity } = item;

      if (!productId || !quantity || quantity < 1) {
        throw new Error("Invalid item — productId and quantity are required");
      }

      // ── LOCK THE ROW — PREVENTS DOUBLE SELLING ────
      // FOR UPDATE locks this product row
      // No concurrent transaction can read or modify it
      // until this transaction commits or rolls back
      const lockedProduct = await tx.$queryRaw`
        SELECT id, name, stock, price
        FROM products
        WHERE id = ${parseInt(productId)}
        AND "isActive" = true
        FOR UPDATE
      `;

      // Product not found after lock attempt
      if (!lockedProduct || lockedProduct.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      const product = lockedProduct[0];

      // ── STOCK CHECK ───────────────────────────────
      // If stock is insufficient — throw triggers ROLLBACK
      // Nothing is saved, lock is released
      if (product.stock < quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}". ` +
            `Available: ${product.stock}, Requested: ${quantity}`,
        );
      }

      // ── ATOMIC STOCK DEDUCTION ────────────────────
      // decrement is atomic at the database level
      // Safe against race conditions because row is locked
      await tx.product.update({
        where: { id: parseInt(productId) },
        data: { stock: { decrement: quantity } },
      });

      // Accumulate total amount
      const itemTotal = parseFloat(product.price) * quantity;
      totalAmount += itemTotal;

      // Store validated item for order creation
      validatedItems.push({
        productId: parseInt(productId),
        quantity,
        price: parseFloat(product.price),
      });
    }

    // ── CREATE ORDER RECORD ───────────────────────
    // Only reached if ALL items passed stock check
    const newOrder = await tx.order.create({
      data: {
        buyerId: req.user.id,
        status: "RESERVED",
        paymentMethod,
        paymentStatus: "PENDING",
        deliveryType,
        totalAmount,
      },
    });

    // ── CREATE ORDER ITEMS ────────────────────────
    // Link each product to the order record
    // createMany inserts all items in one query — efficient
    await tx.orderItem.createMany({
      data: validatedItems.map((item) => ({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // ── FETCH COMPLETE ORDER WITH RELATIONS ───────
    // Get full order data to return in response
    // and to use for PayMongo payment link creation
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

    // ── PRISMA AUTO-COMMITS HERE ──────────────────
    // All steps passed — changes are permanently saved
  });

  // ── AFTER COMMIT — GCASH PAYMENT ──────────────────
  // PayMongo is called OUTSIDE the transaction intentionally
  // External API calls should never be inside atomic transactions
  // Network failures would cause unnecessary rollbacks
  if (order.paymentMethod === "GCASH") {
    // Create GCash payment link via PayMongo
    const payment = await createGCashPaymentLink(
      order.totalAmount,
      order.id,
      `PropeBuy Order #${order.id} — ${order.orderItems.length} item(s)`,
    );

    // Save PayMongo link ID to order for webhook tracking
    // When PayMongo sends webhook — we use this to find the order
    await prisma.order.update({
      where: { id: order.id },
      data: {
        // Store PayMongo reference for webhook lookup
        // We will add paymongoLinkId field to schema next
        paymongoLinkId: payment.linkId,
      },
    });

    // Return order data + GCash payment URL
    return res.status(201).json({
      success: true,
      message: "Order placed. Please complete your GCash payment.",
      data: order,
      paymentUrl: payment.checkoutUrl,
    });
  }

  // ── CASH PAYMENT — ORDER COMPLETE ─────────────────
  // No payment gateway needed — cash on pickup or delivery
  res.status(201).json({
    success: true,
    message: "Order placed successfully. Please prepare your cash payment.",
    data: order,
  });
};

// ── PAYMONGO WEBHOOK HANDLER ───────────────────────────
// PayMongo calls this endpoint when buyer completes GCash payment
// This is how our backend knows the payment was successful
export const handlePaymongoWebhook = async (req, res) => {
  try {
    // Get the PayMongo signature from request headers
    // Used to verify the webhook is genuinely from PayMongo
    const signature = req.headers["paymongo-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing PayMongo signature",
      });
    }

    // Parse the webhook event data
    // req.body contains the payment event from PayMongo
    const event = req.body;
    const eventType = event.data?.attributes?.type;

    // We only care about successful payment events
    // PayMongo sends different event types — we filter for payment success
    if (eventType === "payment.paid") {
      // Get the payment details from the webhook
      const paymentData = event.data.attributes.data;
      const referenceNumber = paymentData?.attributes?.source?.reference_number;

      // Find the order with this PayMongo reference
      // This is why we saved the linkId on the order earlier
      const order = await prisma.order.findFirst({
        where: {
          paymongoLinkId: { not: null },
          paymentStatus: "PENDING",
        },
      });

      if (order) {
        // Update order payment status to PAID
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "PAID",
            status: "PROCESSING",
          },
        });
      }
    }

    // Always respond 200 to PayMongo webhook
    // If we return error — PayMongo will retry sending the webhook
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(400).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

// ── GET MY ORDERS — BUYER ──────────────────────────────
// Returns all orders placed by the currently logged-in buyer
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
    // Most recent orders appear first
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── GET SINGLE ORDER ───────────────────────────────────
// Returns details of one specific order
// Buyer can only view their own orders — security check included
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

  // Security check — buyer can only view their own orders
  // Prevents buyers from accessing other buyers' order details
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
// Returns all orders that contain this seller's products
// Seller only sees their own products within each order
export const getSellerOrders = async (req, res) => {
  const orders = await prisma.order.findMany({
    where: {
      orderItems: {
        // some = at least one order item belongs to this seller
        some: {
          product: {
            sellerId: req.user.id,
          },
        },
      },
    },
    include: {
      orderItems: {
        // Only show this seller's items — not other sellers' items
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
// Seller updates the status of an order
// If cancelled — stock is restored atomically
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Only these statuses are allowed for seller updates
  const validStatuses = ["PROCESSING", "FULFILLED", "CANCELLED"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be PROCESSING, FULFILLED, or CANCELLED",
    });
  }

  // Find the order with its items
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

  // Verify this order contains at least one of this seller's products
  // Prevents sellers from updating other sellers' orders
  const isSellerOrder = order.orderItems.some(
    (item) => item.product.sellerId === req.user.id,
  );

  if (!isSellerOrder) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this order",
    });
  }

  if (status === "CANCELLED") {
    // ── ATOMIC CANCELLATION ─────────────────────
    // Restore stock AND update status in one transaction
    // Both must succeed together or both fail
    await prisma.$transaction(async (tx) => {
      // Restore stock for each cancelled item
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Update order status to cancelled
      await tx.order.update({
        where: { id: parseInt(id) },
        data: { status: "CANCELLED" },
      });
    });
  } else {
    // Simple status update — no stock changes needed
    await prisma.order.update({
      where: { id: parseInt(id) },
      data: { status },
    });
  }

  // Fetch and return the updated order
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

// ── VERIFY PAYMENT STATUS — BUYER ──────────────────────
// Fallback endpoint — buyer can manually check payment status
// Used when webhook fails to deliver or buyer wants to confirm
export const checkPaymentStatus = async (req, res) => {
  const { id } = req.params;

  // Find the order
  const order = await prisma.order.findUnique({
    where: { id: parseInt(id) },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  // Security — buyer can only check their own orders
  if (order.buyerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to check this order",
    });
  }

  // If already paid — just return current status
  if (order.paymentStatus === "PAID") {
    return res.status(200).json({
      success: true,
      message: "Payment already confirmed",
      data: { paymentStatus: order.paymentStatus },
    });
  }

  // If has PayMongo link — check status directly from PayMongo
  if (order.paymongoLinkId) {
    const paymongoStatus = await verifyPaymentStatus(order.paymongoLinkId);

    // If PayMongo says paid — update our database
    if (paymongoStatus === "paid") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "PROCESSING",
        },
      });

      return res.status(200).json({
        success: true,
        message: "Payment confirmed",
        data: { paymentStatus: "PAID" },
      });
    }
  }

  res.status(200).json({
    success: true,
    data: { paymentStatus: order.paymentStatus },
  });
};
