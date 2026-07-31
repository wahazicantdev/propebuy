import { io } from "../index.js";

// ── SEND ORDER STATUS NOTIFICATION ────────────────────
// Pushes real-time notification to a specific user
// via their personal Socket.io room
// userId    — the user to notify
// orderId   — which order was updated
// status    — new order status
// message   — human-readable notification message
export const notifyOrderStatus = (userId, orderId, status, message) => {
  // Emit event to the user's personal room
  // Only the user with this ID will receive this notification
  io.to(`user_${userId}`).emit("order_status_update", {
    orderId,
    status,
    message,
    timestamp: new Date().toISOString(),
  });
};

// ── SEND PAYMENT NOTIFICATION ──────────────────────────
// Notifies buyer when their GCash payment is confirmed
// userId  — the buyer to notify
// orderId — which order was paid
export const notifyPaymentConfirmed = (userId, orderId) => {
  io.to(`user_${userId}`).emit("payment_confirmed", {
    orderId,
    message: "Your GCash payment has been confirmed!",
    timestamp: new Date().toISOString(),
  });
};

// ── SEND LOW STOCK ALERT ───────────────────────────────
// Notifies seller when their product stock falls below threshold
// sellerId  — the seller to notify
// product   — product object with id, name, stock
export const notifyLowStock = (sellerId, product) => {
  io.to(`user_${sellerId}`).emit("low_stock_alert", {
    productId: product.id,
    productName: product.name,
    currentStock: product.stock,
    message: `Low stock alert — "${product.name}" only has ${product.stock} item(s) left`,
    timestamp: new Date().toISOString(),
  });
};
