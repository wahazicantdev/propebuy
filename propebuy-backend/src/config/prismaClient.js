import { PrismaClient } from "@prisma/client";

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
