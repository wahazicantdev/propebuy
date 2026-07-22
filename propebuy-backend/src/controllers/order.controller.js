import {
  processCheckout,
  getBuyerOrders,
  getOrderById,
  getOrdersBySeller,
  changeOrderStatus,
  confirmPaymentStatus,
  processWebhookEvent,
} from "../services/order.service.js";

// ── CHECKOUT ───────────────────────────────────────────
// Validates request then delegates to service
export const checkout = async (req, res) => {
  const { items, paymentMethod, deliveryType } = req.body;

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

  // Delegate all business logic to service
  const { order, paymentUrl } = await processCheckout(
    req.user.id,
    items,
    paymentMethod,
    deliveryType,
  );

  if (paymentUrl) {
    return res.status(201).json({
      success: true,
      message: "Order placed. Please complete your GCash payment.",
      data: order,
      paymentUrl,
    });
  }

  res.status(201).json({
    success: true,
    message: "Order placed successfully. Please prepare your cash payment.",
    data: order,
  });
};

// ── WEBHOOK HANDLER ────────────────────────────────────
// Receives PayMongo webhook — delegates processing to service
export const handlePaymongoWebhook = async (req, res) => {
  try {
    const signature = req.headers["paymongo-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing PayMongo signature",
      });
    }

    // Delegate webhook processing to service
    await processWebhookEvent(req.body);

    // Always return 200 — prevents PayMongo from retrying
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
export const getMyOrders = async (req, res) => {
  const orders = await getBuyerOrders(req.user.id);

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── GET SINGLE ORDER ───────────────────────────────────
export const getOrder = async (req, res) => {
  const order = await getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  // Security — buyer can only view their own orders
  if (order.buyerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to view this order",
    });
  }

  res.status(200).json({ success: true, data: order });
};

// ── GET SELLER ORDERS ──────────────────────────────────
export const getSellerOrders = async (req, res) => {
  const orders = await getOrdersBySeller(req.user.id);

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

// ── UPDATE ORDER STATUS ────────────────────────────────
export const updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["PROCESSING", "FULFILLED", "CANCELLED"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be PROCESSING, FULFILLED, or CANCELLED",
    });
  }

  const updatedOrder = await changeOrderStatus(
    req.params.id,
    status,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    message: `Order status updated to ${status}`,
    data: updatedOrder,
  });
};

// ── CHECK PAYMENT STATUS ───────────────────────────────
export const checkPaymentStatus = async (req, res) => {
  const order = await getOrderById(req.params.id);

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

  const result = await confirmPaymentStatus(req.params.id);

  res.status(200).json({
    success: true,
    message: result.updated ? "Payment confirmed" : "Payment status retrieved",
    data: { paymentStatus: result.paymentStatus },
  });
};
