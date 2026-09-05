import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/env.js";
import {
  extractTextFromImage,
  extractIDFields,
  extractCertificateFields,
  crossCheckDocuments,
  isCertificateRecent,
} from "../utils/ocr.helper.js";

// ── REGISTER ───────────────────────────────────────────
export const register = async (req, res) => {
  const { name, email, password, role, barangayId } = req.body;

  // Validate required fields
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "Name, email, password, and role are required",
    });
  }

  if (!["BUYER", "SELLER"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Role must be either BUYER or SELLER",
    });
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "Email already registered",
    });
  }

  // Check if documents were uploaded
  if (!req.files?.idDocument || !req.files?.certDocument) {
    return res.status(400).json({
      success: false,
      message: "Both government ID and Barangay Certificate are required",
    });
  }

  // Get document buffers from multer memory storage
  const idBuffer = req.files.idDocument[0].buffer;
  const certBuffer = req.files.certDocument[0].buffer;

  // ── UPLOAD DOCUMENTS TO CLOUDINARY ────────────────
  // Upload first — we need URLs regardless of OCR result
  const [idUpload, certUpload] = await Promise.all([
    uploadToCloudinary(idBuffer, "documents"),
    uploadToCloudinary(certBuffer, "documents"),
  ]);

  // ── RUN OCR ON BOTH DOCUMENTS ──────────────────────
  // Extract text from both uploaded images simultaneously
  // Promise.all runs both OCR operations at the same time
  // Much faster than running them one after the other
  console.log("Running OCR on uploaded documents...");

  const [idOCR, certOCR] = await Promise.all([
    extractTextFromImage(idBuffer),
    extractTextFromImage(certBuffer),
  ]);

  console.log("ID OCR confidence:", idOCR.confidence);
  console.log("Certificate OCR confidence:", certOCR.confidence);
  console.log("ID extracted text:", idOCR.text.slice(0, 200)); // log first 200 chars

  // ── EXTRACT STRUCTURED FIELDS FROM OCR TEXT ────────
  const idFields = extractIDFields(idOCR.text);
  const certFields = extractCertificateFields(certOCR.text);

  console.log("Extracted ID fields:", idFields);
  console.log("Extracted certificate fields:", certFields);

  // ── CROSS-CHECK DOCUMENTS ──────────────────────────
  // Compare extracted data — determine verification result
  // Use claimed barangay from registration form
  // If no barangayId provided — use empty string
  const barangay = barangayId
    ? await prisma.barangay.findUnique({
        where: { id: parseInt(barangayId) },
        select: { name: true },
      })
    : null;

  const verificationResult = crossCheckDocuments(
    idFields,
    certFields,
    barangay?.name || "",
  );

  // ── CHECK CERTIFICATE RECENCY ──────────────────────
  const isRecent = isCertificateRecent(certFields.dateIssued);
  if (isRecent === false) {
    // Certificate is older than 6 months
    // Downgrade result to MANUAL_REVIEW if it was AUTO_APPROVED
    if (verificationResult.result === "AUTO_APPROVED") {
      verificationResult.result = "MANUAL_REVIEW";
      verificationResult.issues.push(
        "Barangay Certificate may be outdated — issued more than 6 months ago",
      );
    }
  }

  // ── DETERMINE ACCOUNT STATUS BASED ON OCR RESULT ──
  // AUTO_APPROVED → account immediately VERIFIED
  // MANUAL_REVIEW → account stays PENDING — admin reviews
  // AUTO_REJECTED → account immediately REJECTED
  const accountStatus =
    verificationResult.result === "AUTO_APPROVED"
      ? "VERIFIED"
      : verificationResult.result === "AUTO_REJECTED"
        ? "REJECTED"
        : "PENDING"; // MANUAL_REVIEW

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // ── CREATE USER WITH OCR RESULTS ──────────────────
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      barangayId: barangayId ? parseInt(barangayId) : null,
      idDocumentUrl: idUpload.secure_url,
      certDocumentUrl: certUpload.secure_url,
      accountStatus,

      // Store OCR results for admin reference
      // Even if auto-approved — admin can still review these
      ocrResult: verificationResult.result,
      ocrConfidence: verificationResult.confidence,

      // Store issues as JSON string — Prisma doesn't support arrays
      // Admin portal will parse and display these
      ocrIssues: JSON.stringify(verificationResult.issues),

      // Store extracted data as JSON string for admin reference
      ocrExtractedData: JSON.stringify(verificationResult.extractedData),
    },
  });

  // ── GENERATE JWT TOKEN ─────────────────────────────
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  // ── BUILD RESPONSE MESSAGE ─────────────────────────
  // Different message based on OCR result
  // So user knows what to expect
  const messages = {
    VERIFIED:
      "Registration successful. Your account has been automatically verified. You can now access PropeBuy.",
    REJECTED:
      "Registration failed. Your documents could not be verified. Please ensure you submit valid and matching documents.",
    PENDING:
      "Registration successful. Your documents are pending manual review by our administrators. You will be notified once verified.",
  };

  res.status(201).json({
    success: true,
    message: messages[accountStatus],
    ocrResult: verificationResult.result,
    ocrConfidence: verificationResult.confidence,
    token,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
    },
  });
};

// ── LOGIN ──────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
    },
  });
};

// ── GET CURRENT USER ───────────────────────────────────
export const getMe = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      barangayId: true,
      ocrResult: true,
      ocrConfidence: true,
      createdAt: true,
    },
  });

  res.status(200).json({
    success: true,
    data: user,
  });
};
