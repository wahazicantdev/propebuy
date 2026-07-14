import { PAYMONGO_SECRET_KEY } from "./env.js";

// PayMongo API base URL
export const PAYMONGO_BASE_URL = "https://api.paymongo.com/v1";

// PayMongo requires Basic Auth using Base64 encoded secret key
// Format: Base64("secret_key:")  ← note the colon after the key
// This is how PayMongo authenticates our backend requests
export const getPayMongoAuthHeader = () => {
  const encoded = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");
  return `Basic ${encoded}`;
};
