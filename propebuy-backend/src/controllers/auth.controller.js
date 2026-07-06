import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/env.js";

// ── REGISTER ──────────────────────────────────────────
export const register = async (req, res) => {
  const { name, email, password, role, barangayId } = req.body;

  // Validate required fields
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "Name, email, password, and role are required",
    });
  }

  // Validate role — only BUYER or SELLER can register
  // ADMIN accounts are created manually
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
  // req.files is provided by multer after uploading to Cloudinary
  if (!req.files?.idDocument || !req.files?.certDocument) {
    return res.status(400).json({
      success: false,
      message: "Both government ID and Barangay Certificate are required",
    });
  }

  // Get Cloudinary URLs from uploaded files
  const idDocumentUrl = req.files.idDocument[0].path;
  const certDocumentUrl = req.files.certDocument[0].path;

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user in database
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      barangayId: barangayId ? parseInt(barangayId) : null,
      idDocumentUrl,
      certDocumentUrl,
      accountStatus: "PENDING",
    },
  });

  // Generate JWT token
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.status(201).json({
    success: true,
    message:
      "Registration successful. Your account is pending admin verification.",
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

  // Validate required fields
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Compare password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  // Generate JWT token
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
  // req.user is set by the auth middleware
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      barangayId: true,
      createdAt: true,
    },
  });

  res.status(200).json({
    success: true,
    data: user,
  });
};
