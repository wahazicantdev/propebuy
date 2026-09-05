// ── PROPEBUY ROUTE PROTECTION AUDIT ───────────────────
// Reference document — verifies all routes are properly protected
// Every route should have appropriate middleware

// PUBLIC ROUTES — no auth needed
// GET  /api/products              → getProducts
// GET  /api/products/barangays    → getBarangays
// GET  /api/products/categories   → getCategories
// GET  /api/products/:id          → getProduct
// POST /api/auth/register         → register
// POST /api/auth/login            → login
// POST /api/orders/webhook/paymongo → handlePaymongoWebhook

// BUYER PROTECTED ROUTES — protect + authorize("BUYER")
// GET  /api/auth/me               → getMe
// POST /api/orders/cart/validate  → validateCartItem
// POST /api/orders/checkout       → checkout
// GET  /api/orders/my-orders      → getMyOrders
// GET  /api/orders/:id            → getOrder
// GET  /api/orders/:id/payment-status → checkPaymentStatus

// SELLER PROTECTED ROUTES — protect + authorize("SELLER")
// POST /api/products              → createProduct
// GET  /api/products/seller/my-products → getMyProducts
// PUT  /api/products/:id          → updateProduct
// DELETE /api/products/:id        → deleteProduct
// GET  /api/orders/seller/received → getSellerOrders
// PUT  /api/orders/:id/status     → updateOrderStatus
// GET  /api/analytics/seller      → getSellerAnalytics

// ADMIN PROTECTED ROUTES — protect + authorize("ADMIN")
// GET  /api/admin/users           → getAllUsers
// GET  /api/admin/users/verifications/pending → getPendingVerifications
// GET  /api/admin/users/:id       → getUser
// PUT  /api/admin/users/:id/verify → verifyUser
// PUT  /api/admin/users/:id/suspend → suspendUser
// GET  /api/admin/products        → getAllProducts
// PUT  /api/admin/products/:id/remove → removeProduct
// GET  /api/admin/orders          → getAllOrders
// POST /api/admin/barangays       → addBarangay
// PUT  /api/admin/barangays/:id/toggle → toggleBarangay
// POST /api/admin/categories      → addCategory
// PUT  /api/admin/categories/:id/toggle → toggleCategory
// GET  /api/analytics/platform    → getPlatformAnalytics
