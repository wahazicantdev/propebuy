// ── GLOBAL ERROR HANDLER ───────────────────────────────
// Catches all errors thrown in controllers and services
// Must be the LAST middleware in index.js
// Express identifies error handlers by the 4 parameters (err, req, res, next)
export const errorHandler = (err, req, res, next) => {
  // Log error details to console for debugging
  // In production — this would go to a logging service
  console.error(`[ERROR] ${err.name}: ${err.message}`);
  console.error(err.stack);

  // ── PRISMA ERROR HANDLING ──────────────────────────
  // Prisma throws specific error codes for database issues
  // We catch them here and return human-readable messages

  // P2002 — Unique constraint violation
  // Example: trying to register with existing email
  if (err.code === "P2002") {
    return res.status(400).json({
      success: false,
      message: `This ${err.meta?.target?.[0] || "field"} already exists`,
    });
  }

  // P2025 — Record not found
  // Example: updating a product that was deleted
  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      message: "Record not found",
    });
  }

  // P2003 — Foreign key constraint violation
  // Example: creating order for non-existent product
  if (err.code === "P2003") {
    return res.status(400).json({
      success: false,
      message: "Related record not found",
    });
  }

  // ── JWT ERROR HANDLING ─────────────────────────────
  // JWT throws specific errors for token issues

  // Token expired
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired — please login again",
    });
  }

  // Token invalid — tampered or malformed
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token — please login again",
    });
  }

  // ── MULTER ERROR HANDLING ──────────────────────────
  // Multer throws specific errors for file upload issues

  // File too large — exceeds our 5MB limit
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File too large — maximum size is 5MB",
    });
  }

  // Wrong file type — not JPG, PNG, or PDF
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Unexpected file field",
    });
  }

  // ── DEFAULT ERROR HANDLER ──────────────────────────
  // For any error not caught above
  // Use err.statusCode if set, otherwise default to 500
  const statusCode = err.statusCode || 500;
  const message =
    // In production — don't expose internal error details
    // In development — show actual error message for debugging
    process.env.NODE_ENV === "production" && statusCode === 500
      ? "Internal server error"
      : err.message || "Something went wrong";

  res.status(statusCode).json({
    success: false,
    message,
  });
};
