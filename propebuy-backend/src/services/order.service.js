import prisma from "../config/prismaClient.js";
import { cleanInt, cleanPrice } from "../utils/format.helper.js";
import {
  createGCashPaymentLink,
  verifyPaymentStatus,
} from "../utils/paymongo.helper.js";

// ── CHECKOUT SERVICE ───────────────────────────────────
// Contains the full TPS logic and PayMongo integration
// Called by the checkout controller
export const processCheckout = async (
  buyerId,
  items,
  paymentMethod,
  deliveryType,
) => {
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
      // FOR UPDATE locks this specific product row
      // No concurrent transaction can touch it
      // until this transaction commits or rolls back
      const lockedProduct = await tx.$queryRaw`
        SELECT id, name, stock, price
        FROM products
        WHERE id = ${cleanInt(productId)}
        AND "isActive" = true
        FOR UPDATE
      `;

      if (!lockedProduct || lockedProduct.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      const product = lockedProduct[0];

      // ── STOCK CHECK ───────────────────────────────
      // If insufficient — throw triggers automatic ROLLBACK
      if (product.stock < quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}". ` +
            `Available: ${product.stock}, Requested: ${quantity}`,
        );
      }

      // ── ATOMIC STOCK DEDUCTION ────────────────────
      // decrement is atomic — safe against race conditions
      await tx.product.update({
        where: { id: cleanInt(productId) },
        data: { stock: { decrement: quantity } },
      });

      const itemTotal = cleanPrice(product.price) * quantity;
      totalAmount += itemTotal;

      validatedItems.push({
        productId: cleanInt(productId),
        quantity,
        price: cleanPrice(product.price),
      });
    }

    // ── CREATE ORDER RECORD ───────────────────────
    const newOrder = await tx.order.create({
      data: {
        buyerId,
        status: "RESERVED",
        paymentMethod,
        paymentStatus: "PENDING",
        deliveryType,
        totalAmount,
      },
    });

    // ── CREATE ORDER ITEMS ────────────────────────
    // createMany inserts all items in one efficient query
    await tx.orderItem.createMany({
      data: validatedItems.map((item) => ({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // ── RETURN COMPLETE ORDER — PRISMA AUTO-COMMITS ──
    return await tx.order.findUnique({
      where: { id: newOrder.id },
      include: {
        orderItems: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
        buyer: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  });

  // ── AFTER COMMIT — GCASH PAYMENT ─────────────────
  // PayMongo called OUTSIDE transaction — intentional
  // External API calls must never be inside atomic transactions
  if (paymentMethod === "GCASH") {
    const payment = await createGCashPaymentLink(
      order.totalAmount,
      order.id,
      `PropeBuy Order #${order.id} — ${order.orderItems.length} item(s)`,
    );

    // Save PayMongo link ID for webhook tracking
    await prisma.order.update({
      where: { id: order.id },
      data: { paymongoLinkId: payment.linkId },
    });

    // Return order with GCash payment URL
    return { order, paymentUrl: payment.checkoutUrl };
  }

  // Cash payment — no payment gateway needed
  return { order, paymentUrl: null };
};

// ── HANDLE WEBHOOK SERVICE ─────────────────────────────
// Processes PayMongo webhook events
export const processWebhookEvent = async (event) => {
  const eventType = event.data?.attributes?.type;

  // Only process successful payment events
  if (eventType === "payment.paid" || eventType === "link.payment.paid") {
    // Find pending order with a PayMongo link
    const order = await prisma.order.findFirst({
      where: {
        paymongoLinkId: { not: null },
        paymentStatus: "PENDING",
      },
    });

    if (order) {
      // Mark order as paid and move to processing
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "PROCESSING",
        },
      });
    }
  }
};

// ── GET BUYER ORDERS SERVICE ───────────────────────────
// Fetches all orders for a specific buyer
export const getBuyerOrders = async (buyerId) => {
  return await prisma.order.findMany({
    where: { buyerId },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              seller: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

// ── GET SINGLE ORDER SERVICE ───────────────────────────
// Fetches one order by ID with full relations
export const getOrderById = async (orderId) => {
  return await prisma.order.findUnique({
    where: { id: cleanInt(orderId) },
    include: {
      orderItems: {
        include: {
          product: {
            select: { id: true, name: true, imageUrl: true },
          },
        },
      },
      buyer: {
        select: { id: true, name: true, email: true },
      },
    },
  });
};

// ── GET SELLER ORDERS SERVICE ──────────────────────────
// Fetches orders containing this seller's products
export const getOrdersBySeller = async (sellerId) => {
  return await prisma.order.findMany({
    where: {
      orderItems: {
        // At least one item belongs to this seller
        some: { product: { sellerId } },
      },
    },
    include: {
      orderItems: {
        // Only this seller's items — not other sellers'
        where: { product: { sellerId } },
        include: {
          product: {
            select: { id: true, name: true, imageUrl: true, price: true },
          },
        },
      },
      buyer: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

// ── UPDATE ORDER STATUS SERVICE ────────────────────────
// Updates order status — restores stock if cancelled
export const changeOrderStatus = async (orderId, status, sellerId) => {
  const order = await prisma.order.findUnique({
    where: { id: cleanInt(orderId) },
    include: {
      orderItems: {
        include: { product: true },
      },
    },
  });

  if (!order) throw new Error("Order not found");

  // Verify this order contains this seller's products
  const isSellerOrder = order.orderItems.some(
    (item) => item.product.sellerId === sellerId,
  );

  if (!isSellerOrder) throw new Error("Not authorized to update this order");

  if (status === "CANCELLED") {
    // ── ATOMIC CANCELLATION ───────────────────────
    // Restore stock AND update status together
    // Both succeed or both fail
    await prisma.$transaction(async (tx) => {
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      await tx.order.update({
        where: { id: cleanInt(orderId) },
        data: { status: "CANCELLED" },
      });
    });
  } else {
    await prisma.order.update({
      where: { id: cleanInt(orderId) },
      data: { status },
    });
  }

  // Return updated order
  return await prisma.order.findUnique({
    where: { id: cleanInt(orderId) },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
    },
  });
};

// ── CHECK PAYMENT STATUS SERVICE ───────────────────────
// Verifies GCash payment — uses PayMongo as fallback
export const confirmPaymentStatus = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: cleanInt(orderId) },
  });

  if (!order) throw new Error("Order not found");

  // Already paid — return immediately
  if (order.paymentStatus === "PAID") {
    return { paymentStatus: "PAID", updated: false };
  }

  // Check with PayMongo directly if we have a link ID
  if (order.paymongoLinkId) {
    const paymongoStatus = await verifyPaymentStatus(order.paymongoLinkId);

    if (paymongoStatus === "paid") {
      // Update database to reflect confirmed payment
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", status: "PROCESSING" },
      });
      return { paymentStatus: "PAID", updated: true };
    }
  }

  return { paymentStatus: order.paymentStatus, updated: false };
};
