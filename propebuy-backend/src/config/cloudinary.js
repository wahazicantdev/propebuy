import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./env.js";

// Configure cloudinary with our credentials
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Use memory storage — files are stored in RAM temporarily
// then we manually upload them to Cloudinary
// This avoids the multer-storage-cloudinary version conflict
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only allow images and PDFs
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and PDF files are allowed"), false);
    }
  },
});

// Helper function to upload a file buffer to Cloudinary
// buffer — the file data from multer memoryStorage
// folder — which Cloudinary folder to save it in
export const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `propebuy/${folder}`,
          resource_type: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      )
      .end(buffer);
  });
};

export default cloudinary;
