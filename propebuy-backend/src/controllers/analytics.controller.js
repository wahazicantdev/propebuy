import prisma from "../config/prismaClient.js";

// ── SELLER ANALYTICS DASHBOARD ─────────────────────────
// Returns comprehensive sales data for the seller dashboard
// Covers total sales, top products, order trends, revenue
export const getSellerAnalytics = async (req, res) => {
  const sellerId = req.user.id;

  // ── TOTAL ORDERS COUNT ────────────────────────────
  // Count all orders containing this seller's products
  const totalOrders = await prisma.order.count({
    where: {
      orderItems: {
        some: { product: { sellerId } },
      },
    },
  });

  // ── ORDERS BY STATUS ──────────────────────────────
  // Count orders grouped by their current status
  // Gives seller overview of their order pipeline
  const ordersByStatus = await prisma.order.groupBy({
    by: ["status"],
    where: {
      orderItems: {
        some: { product: { sellerId } },
      },
    },
    _count: { status: true },
  });

  // ── TOTAL REVENUE ─────────────────────────────────
  // Sum of all fulfilled order items for this seller
  // Only counts FULFILLED orders — not pending or cancelled
  const revenueData = await prisma.orderItem.aggregate({
    where: {
      product: { sellerId },
      order: { status: "FULFILLED" },
    },
    _sum: {
      // price * quantity = item revenue
      price: true,
    },
    _count: {
      id: true,
    },
  });

  // ── TOP SELLING PRODUCTS ──────────────────────────
  // Find the seller's best performing products
  // Sorted by total quantity sold
  const topProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      product: { sellerId },
      order: {
        status: { in: ["PROCESSING", "FULFILLED"] },
      },
    },
    _sum: { quantity: true },
    _count: { id: true },
    orderBy: {
      _sum: { quantity: "desc" },
    },
    take: 5, // Top 5 products only
  });

  // Get product details for top products
  const topProductsWithDetails = await Promise.all(
    topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          stock: true,
        },
      });
      return {
        product,
        totalSold: item._sum.quantity,
        totalOrders: item._count.id,
      };
    }),
  );

  // ── RECENT ORDERS ─────────────────────────────────
  // Last 5 orders for quick overview on dashboard
  const recentOrders = await prisma.order.findMany({
    where: {
      orderItems: {
        some: { product: { sellerId } },
      },
    },
    include: {
      orderItems: {
        where: { product: { sellerId } },
        include: {
          product: { select: { id: true, name: true } },
        },
      },
      buyer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // ── LOW STOCK PRODUCTS ────────────────────────────
  // Products with stock at or below 3
  // Seller needs to restock these soon
  const lowStockProducts = await prisma.product.findMany({
    where: {
      sellerId,
      isActive: true,
      stock: { lte: 3 },
    },
    select: {
      id: true,
      name: true,
      stock: true,
      imageUrl: true,
    },
    orderBy: { stock: "asc" },
  });

  // ── MONTHLY REVENUE TREND ─────────────────────────
  // Revenue per month for the last 6 months
  // Used for the revenue chart in the dashboard
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyOrders = await prisma.order.findMany({
    where: {
      orderItems: {
        some: { product: { sellerId } },
      },
      status: "FULFILLED",
      createdAt: { gte: sixMonthsAgo },
    },
    include: {
      orderItems: {
        where: { product: { sellerId } },
        select: { price: true, quantity: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group orders by month manually
  // Prisma doesn't have a built-in groupBy date function
  const monthlyRevenue = monthlyOrders.reduce((acc, order) => {
    // Get month label — example: "2026-07"
    const monthKey = order.createdAt.toISOString().slice(0, 7);

    // Calculate order revenue for this seller's items only
    const orderRevenue = order.orderItems.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0,
    );

    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, revenue: 0, orders: 0 };
    }

    acc[monthKey].revenue += orderRevenue;
    acc[monthKey].orders += 1;

    return acc;
  }, {});

  // Convert to array for frontend chart consumption
  const revenueChart = Object.values(monthlyRevenue);

  // ── COMPILE AND RETURN ALL ANALYTICS ─────────────
  res.status(200).json({
    success: true,
    data: {
      // Summary cards
      summary: {
        totalOrders,
        totalRevenue: parseFloat(revenueData._sum.price || 0),
        totalItemsSold: revenueData._count.id || 0,
        lowStockCount: lowStockProducts.length,
      },
      // Order pipeline breakdown
      ordersByStatus,
      // Top 5 best-selling products
      topProducts: topProductsWithDetails,
      // Recent 5 orders
      recentOrders,
      // Products needing restock
      lowStockProducts,
      // Monthly revenue for chart
      revenueChart,
    },
  });
};

// ── PLATFORM ANALYTICS — ADMIN ONLY ───────────────────
// Overall platform statistics for the admin dashboard
export const getPlatformAnalytics = async (req, res) => {
  // ── TOTAL USERS ───────────────────────────────────
  const totalUsers = await prisma.user.count();
  const totalBuyers = await prisma.user.count({ where: { role: "BUYER" } });
  const totalSellers = await prisma.user.count({ where: { role: "SELLER" } });
  const pendingVerifications = await prisma.user.count({
    where: { accountStatus: "PENDING" },
  });

  // ── TOTAL PRODUCTS ────────────────────────────────
  const totalProducts = await prisma.product.count({
    where: { isActive: true },
  });

  // ── TOTAL ORDERS ──────────────────────────────────
  const totalOrders = await prisma.order.count();
  const ordersByStatus = await prisma.order.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  // ── PLATFORM REVENUE ──────────────────────────────
  // Total value of all fulfilled orders on the platform
  const platformRevenue = await prisma.order.aggregate({
    where: { status: "FULFILLED" },
    _sum: { totalAmount: true },
  });

  // ── TOP BARANGAYS BY ORDER VOLUME ─────────────────
  const topBarangays = await prisma.product.groupBy({
    by: ["barangayId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  const topBarangaysWithDetails = await Promise.all(
    topBarangays.map(async (item) => {
      const barangay = await prisma.barangay.findUnique({
        where: { id: item.barangayId },
        select: { id: true, name: true },
      });
      return { barangay, productCount: item._count.id };
    }),
  );

  res.status(200).json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        buyers: totalBuyers,
        sellers: totalSellers,
        pendingVerifications,
      },
      products: { total: totalProducts },
      orders: {
        total: totalOrders,
        byStatus: ordersByStatus,
      },
      revenue: {
        total: parseFloat(platformRevenue._sum.totalAmount || 0),
      },
      topBarangays: topBarangaysWithDetails,
    },
  });
};
