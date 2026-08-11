import "./env.js";
import { PrismaClient } from "@prisma/client";

// Initialize Prisma Client
// In development — log all queries, info, warnings, and errors
// In production — log errors only to keep console clean
const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

// Initialize Prisma Client with custom transaction timeout
// Default timeout is 5000ms — too short for Neon's cold starts
// Increased to 30000ms (30 seconds) to handle:
// - Neon serverless cold starts
// - Network latency from Philippines to US servers
// - Free tier throttling
const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000, // max time to wait for transaction to start — 10 seconds
    timeout: 30000, // max time for transaction to complete — 30 seconds
  },
});

export default prisma;
