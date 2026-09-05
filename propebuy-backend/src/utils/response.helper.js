// ── API RESPONSE HELPERS ───────────────────────────────
// Standardizes all API responses across PropeBuy
// Ensures consistent format whether success or error
// Frontend can always expect the same response shape

// ── SUCCESS RESPONSE ───────────────────────────────────
// Used for successful operations
// statusCode — HTTP status (default 200)
// message    — human-readable success message
// data       — the actual response data (optional)
// meta       — pagination or extra info (optional)
export const successResponse = (
  res,
  { statusCode = 200, message = "Success", data = null, meta = null } = {},
) => {
  // Build response object — only include data/meta if provided
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.status(statusCode).json(response);
};

// ── ERROR RESPONSE ─────────────────────────────────────
// Used for failed operations
// statusCode — HTTP status (default 400)
// message    — human-readable error message
// errors     — array of validation errors (optional)
export const errorResponse = (
  res,
  { statusCode = 400, message = "Something went wrong", errors = null } = {},
) => {
  const response = { success: false, message };
  if (errors !== null) response.errors = errors;

  return res.status(statusCode).json(response);
};
