import { Router } from "express";
import { register, login, getMe } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../config/cloudinary.js";

const authRoutes = Router();

// Public routes — no token needed
// uploadDocuments.fields() tells multer to expect
// two file fields — idDocument and certDocument
authRoutes.post(
  "/register",
  upload.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "certDocument", maxCount: 1 },
  ]),
  register,
);

authRoutes.post("/login", login);

// Protected route — token required
authRoutes.get("/me", protect, getMe);

export default authRoutes;
