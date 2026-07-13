import { config } from "dotenv";

config();

export const {
  PORT,
  DATABASE_URL,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CLIENT_URL,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  // PayMongo credentials
  PAYMONGO_SECRET_KEY,
  PAYMONGO_PUBLIC_KEY,
  PAYMONGO_WEBHOOK_SECRET,
  // Redirect URLs after payment
  PAYMENT_SUCCESS_URL,
  PAYMENT_FAILED_URL,
} = process.env;
