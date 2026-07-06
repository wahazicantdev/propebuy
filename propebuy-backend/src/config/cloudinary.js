import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./env.js";

// Configure cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Storage for identity documents
// This is where user IDs and barangay certificates will be stored
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "propebuy/documents",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
    resource_type: "auto",
  },
});

// Storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "propebuy/products",
    allowed_formats: ["jpg", "jpeg", "png"],
    resource_type: "image",
  },
});

// Multer upload instances
// uploadDocuments — used during registration for ID and certificate
// uploadProduct — used when seller creates a product listing
export const uploadDocuments = multer({ storage: documentStorage });
export const uploadProduct = multer({ storage: productStorage });

export default cloudinary;
