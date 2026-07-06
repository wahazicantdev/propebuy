import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import prisma from "../config/prismaClient.js";

// ── PROTECT ROUTE ──────────────────────────────────────
// Verifies JWT token and attaches user to req.user
export const protect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized — no token provided",
    });
  }

  // Verify token
  const decoded = jwt.verify(token, JWT_SECRET);

  // Find user from decoded token
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Not authorized — user not found",
    });
  }

  // Attach user to request
  req.user = user;
  next();
};

// ── ROLE CHECK ─────────────────────────────────────────
// Restricts route access based on user role
// Usage: authorize("ADMIN") or authorize("SELLER", "ADMIN")
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

// ── VERIFIED CHECK ─────────────────────────────────────
// Ensures user account is VERIFIED before accessing protected features
export const requireVerified = (req, res, next) => {
  if (req.user.accountStatus !== "VERIFIED") {
    return res.status(403).json({
      success: false,
      message:
        "Your account is pending verification. Please wait for admin approval.",
    });
  }
  next();
};
