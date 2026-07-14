import {
  PAYMONGO_BASE_URL,
  getPayMongoAuthHeader,
} from "../config/paymongo.js";
import { PAYMENT_SUCCESS_URL, PAYMENT_FAILED_URL } from "../config/env.js";

// ── CREATE GCASH PAYMENT LINK ──────────────────────────
// Creates a PayMongo payment link for GCash payment
// Called AFTER the TPS transaction commits successfully
// amount     — total order amount in PHP
// orderId    — our internal order ID for tracking
// description — shown to buyer on the GCash payment screen
export const createGCashPaymentLink = async (amount, orderId, description) => {
  // PayMongo requires amount in centavos — multiply by 100
  // Example: ₱85.50 → 8550 centavos
  const amountInCentavos = Math.round(parseFloat(amount) * 100);

  // Call PayMongo Links API directly using fetch
  // PayMongo Links = shareable payment links that support GCash
  const response = await fetch(`${PAYMONGO_BASE_URL}/links`, {
    method: "POST",
    headers: {
      // Content type must be JSON
      "Content-Type": "application/json",
      // Authorization uses our encoded secret key
      Authorization: getPayMongoAuthHeader(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amountInCentavos,
          description: description || `PropeBuy Order #${orderId}`,
          remarks: `Order ID: ${orderId}`,
        },
      },
    }),
  });

  // Parse the PayMongo response
  const data = await response.json();

  // If PayMongo returned an error — throw it
  // This will be caught by our error handler middleware
  if (!response.ok) {
    throw new Error(
      data.errors?.[0]?.detail || "Failed to create PayMongo payment link",
    );
  }

  // Return the important parts of the PayMongo response
  return {
    // URL to redirect buyer to for GCash payment
    checkoutUrl: data.data.attributes.checkout_url,
    // PayMongo reference number — shown to buyer after payment
    referenceNumber: data.data.attributes.reference_number,
    // PayMongo link ID — used to check payment status later
    linkId: data.data.id,
  };
};

// ── VERIFY PAYMENT STATUS ──────────────────────────────
// Checks the current status of a PayMongo payment link
// Used as fallback when webhook delivery fails
// linkId — the PayMongo link ID we saved on the order
export const verifyPaymentStatus = async (linkId) => {
  const response = await fetch(`${PAYMONGO_BASE_URL}/links/${linkId}`, {
    method: "GET",
    headers: {
      Authorization: getPayMongoAuthHeader(),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.errors?.[0]?.detail || "Failed to verify payment status",
    );
  }

  // Returns "paid", "unpaid", or "pending"
  return data.data.attributes.status;
};
