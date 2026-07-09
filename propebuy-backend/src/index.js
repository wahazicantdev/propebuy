import express from "express";
import cors from "cors";
import "express-async-errors";

import { CLIENT_URL, PORT } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";

const app = express();

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

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "PropeBuy API is running!",
    status: "OK",
  });
});

// Error handler — must be last
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`PropeBuy backend running on port http://localhost:${PORT}`);
});

export default app;
