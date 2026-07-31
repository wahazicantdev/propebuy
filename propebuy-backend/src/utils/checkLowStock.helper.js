// Low stock threshold — notify seller when stock hits this number
const LOW_STOCK_THRESHOLD = 3;

// ── CHECK AND NOTIFY LOW STOCK ─────────────────────────
// Checks if product stock is at or below threshold
// and sends real-time alert to seller if so
export const checkLowStock = async (productId, sellerId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stock: true },
  });

  if (product && product.stock <= LOW_STOCK_THRESHOLD) {
    notifyLowStock(sellerId, product);
  }
};
