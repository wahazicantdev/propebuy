import { Router } from "express";
import { register, login, getMe } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadDocuments } from "../config/cloudinary.js";

const router = Router();

// Public routes — no token needed
// uploadDocuments.fields() tells multer to expect
// two file fields — idDocument and certDocument
router.post(
  "/register",
  uploadDocuments.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "certDocument", maxCount: 1 },
  ]),
  register,
);

router.post("/login", login);

// Protected route — token required
router.get("/me", protect, getMe);

export default router;
