import { body, param, query, validationResult } from "express-validator";

// ── VALIDATION RESULT HANDLER ──────────────────────────
// Checks if any validation errors occurred
// If yes — returns 400 with all error messages
// If no — calls next() to proceed to controller
// Used as middleware after validation chains
export const handleValidationErrors = (req, res, next) => {
  // validationResult() collects all errors from validation chain
  const errors = validationResult(req);

  // isEmpty() returns true if no errors found
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      // array() converts errors to readable array format
      errors: errors.array().map((err) => ({
        field: err.path, // which field caused the error
        message: err.msg, // what the error message is
      })),
    });
  }

  // No errors — proceed to controller
  next();
};

// ── AUTH VALIDATIONS ───────────────────────────────────

// Validates registration request body
// Checks all required fields before reaching controller
export const validateRegister = [
  // name — required, must be string, trim whitespace
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  // email — required, must be valid email format
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    // normalizeEmail converts to lowercase and removes dots in Gmail
    .normalizeEmail(),

  // password — required, minimum 6 characters
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  // role — required, must be BUYER or SELLER
  // Admin accounts cannot be created through registration
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["BUYER", "SELLER"])
    .withMessage("Role must be either BUYER or SELLER"),

  // Run the validation result handler after all checks
  handleValidationErrors,
];

// Validates login request body
export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

// ── PRODUCT VALIDATIONS ────────────────────────────────

// Validates product creation request body
export const validateCreateProduct = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Product name is required")
    .isLength({ min: 2, max: 255 })
    .withMessage("Product name must be between 2 and 255 characters"),

  body("price")
    .notEmpty()
    .withMessage("Price is required")
    .customSanitizer((value) => {
      // Remove commas from price before validation
      // Handles inputs like "10,267.17"
      return String(value).replace(/,/g, "");
    })
    .isFloat({ min: 1 })
    .withMessage("Price must be a positive number greater than 0"),

  body("stock")
    .notEmpty()
    .withMessage("Stock is required")
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative whole number"),

  body("categoryId")
    .notEmpty()
    .withMessage("Category is required")
    .isInt({ min: 1 })
    .withMessage("Please select a valid category"),

  // description is optional — no notEmpty()
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description cannot exceed 1000 characters"),

  handleValidationErrors,
];

// Validates product update — all fields optional
// Only validates fields that are actually provided
export const validateUpdateProduct = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("Product name must be between 2 and 255 characters"),

  body("price")
    .optional()
    .customSanitizer((value) => String(value).replace(/,/g, ""))
    .isFloat({ min: 1 })
    .withMessage("Price must be a positive number greater than 0"),

  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative whole number"),

  body("categoryId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Please select a valid category"),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description cannot exceed 1000 characters"),

  handleValidationErrors,
];

// ── ORDER VALIDATIONS ──────────────────────────────────

// Validates checkout request body
export const validateCheckout = [
  // items must be a non-empty array
  body("items")
    .isArray({ min: 1 })
    .withMessage("At least one item is required"),

  // Each item in the array must have valid productId and quantity
  body("items.*.productId")
    .isInt({ min: 1 })
    .withMessage("Each item must have a valid product ID"),

  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Each item quantity must be at least 1"),

  body("paymentMethod")
    .notEmpty()
    .withMessage("Payment method is required")
    .isIn(["CASH", "GCASH"])
    .withMessage("Payment method must be CASH or GCASH"),

  body("deliveryType")
    .notEmpty()
    .withMessage("Delivery type is required")
    .isIn(["PICKUP", "DELIVERY"])
    .withMessage("Delivery type must be PICKUP or DELIVERY"),

  handleValidationErrors,
];

// ── ADMIN VALIDATIONS ──────────────────────────────────

// Validates user verification action
export const validateVerifyUser = [
  body("action")
    .notEmpty()
    .withMessage("Action is required")
    .isIn(["approve", "reject"])
    .withMessage("Action must be approve or reject"),

  // barangayId required only when approving
  body("barangayId")
    .if(body("action").equals("approve"))
    .notEmpty()
    .withMessage("Barangay ID is required when approving")
    .isInt({ min: 1 })
    .withMessage("Please provide a valid barangay ID"),

  handleValidationErrors,
];

// Validates barangay creation
export const validateAddBarangay = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Barangay name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Barangay name must be between 2 and 100 characters"),

  body("city")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("City name must be between 2 and 100 characters"),

  handleValidationErrors,
];

// Validates category creation
export const validateAddCategory = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Category name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters"),

  handleValidationErrors,
];

// ── URL PARAMETER VALIDATIONS ──────────────────────────

// Validates that :id in URL is a valid positive integer
// Used on routes like /api/products/:id
export const validateIdParam = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID must be a valid positive integer"),

  handleValidationErrors,
];
