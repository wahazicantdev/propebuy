// ── FORMAT HELPERS ─────────────────────────────────────
// Reusable utility functions for data formatting
// and input cleaning throughout the PropeBuy backend

// ── CLEAN PRICE ────────────────────────────────────────
// Removes commas used as thousands separators
// then converts to float for database storage
// Handles inputs like "10,267.17" → 10267.17
// and regular inputs like "85.50" → 85.50
export const cleanPrice = (price) => {
  return parseFloat(String(price).replace(/,/g, ""));
};

// ── CLEAN INTEGER ──────────────────────────────────────
// Safely converts string input to integer
// Used for IDs and quantities from req.body
// Example: "3" → 3
export const cleanInt = (value) => {
  return parseInt(String(value).replace(/,/g, ""), 10);
};
