import express from "express";
import cors from "cors";
import "express-async-errors";
import { createServer } from "http";
import { Server } from "socket.io";
// Imported config/middleware
import { CLIENT_URL, PORT } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
// Imported Routes
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import adminRoutes from "./routes/admin.routes.js";

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
app.use("/api/admin", adminRoutes);

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
const server = httpServer.listen(PORT, () => {
  console.log(`PropeBuy backend running on port http://localhost:${PORT}`);
});

// ── PROCESS EVENT HANDLERS ─────────────────────────────
// These handle unexpected errors and graceful shutdown
// Without these — server can crash without proper cleanup

// Catches Promise rejections that were never handled
// Example: async function threw but had no try-catch
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);

  // Close server gracefully — stop accepting new requests
  // Then disconnect from database — then exit
  server.close(async () => {
    await prisma.$disconnect();
    console.log("Database disconnected after unhandled rejection");
    process.exit(1); // Exit with error code 1
  });
});

// Catches synchronous errors that bubble up to the top
// Example: programming bugs that throw unexpectedly
process.on("uncaughtException", async (err) => {
  console.error("Uncaught Exception:", err);

  // Disconnect from database before exiting
  await prisma.$disconnect();
  console.log("Database disconnected after uncaught exception");
  process.exit(1); // Exit with error code 1
});

// Handles graceful shutdown signal
// Sent by: Ctrl+C, deployment restart, Docker stop
// Gives server time to finish current requests before stopping
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");

  server.close(async () => {
    // Disconnect from database cleanly
    await prisma.$disconnect();
    console.log("Database disconnected — server shut down cleanly");
    process.exit(0); // Exit with success code 0
  });
});

export default app;
