import express from "express";
import cors from "cors";
import "express-async-errors";
import { createServer } from "http";
import { Server } from "socket.io";

import { CLIENT_URL, PORT } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();

// ── CREATE HTTP SERVER ─────────────────────────────────
// We wrap Express in a raw HTTP server
// because Socket.io needs direct access to the HTTP server
// not just the Express app
const httpServer = createServer(app);

// ── INITIALIZE SOCKET.IO ───────────────────────────────
// Attach Socket.io to the HTTP server
// cors config allows our React frontend to connect
export const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── SOCKET.IO CONNECTION HANDLER ───────────────────────
// Runs every time a client connects to the socket server
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── JOIN PERSONAL ROOM ───────────────────────────
  // When user connects — they join a room named after their user ID
  // This allows us to send notifications to specific users
  // Example: room "user_5" = only user with ID 5 receives events
  socket.on("join", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  });

  // ── DISCONNECT HANDLER ───────────────────────────
  // Fires when client disconnects — browser closed, tab closed, etc.
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
// Parse JSON bodies for incoming requests, Example: { "task": "Buy groceries" }, and make it available in req.body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "PropeBuy API is running!",
    status: "OK",
  });
});

// Error handler — must be last
app.use(errorHandler);

// ── START SERVER ───────────────────────────────────────
// Use httpServer.listen instead of app.listen
// because Socket.io is attached to httpServer — not app
httpServer.listen(PORT, () => {
  console.log(`PropeBuy backend running on port http://localhost:${PORT}`);
});

export default app;
