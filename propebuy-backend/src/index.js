import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
// Parse JSON bodies for incoming requests, Example: { "task": "Buy groceries" }, and make it available in req.body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "PropeBuy API is running!",
    status: "OK",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`PropeBuy backend running on port http://localhost:${PORT}`);
});
