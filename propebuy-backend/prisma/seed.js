import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Seed barangays for Muntinlupa City
  const barangays = [
    { name: "Alabang" },
    { name: "Bayanan" },
    { name: "Buli" },
    { name: "Cupang" },
    { name: "Poblacion" },
    { name: "Putatan" },
    { name: "Sucat" },
    { name: "Tunasan" },
  ];

  for (const barangay of barangays) {
    await prisma.barangay.upsert({
      where: { name: barangay.name },
      update: {},
      create: {
        name: barangay.name,
        city: "Muntinlupa City",
        isActive: true,
      },
    });
  }

  // Seed categories
  const categories = [
    { name: "Food and Packaged Goods" },
    { name: "Clothing and Apparel" },
    { name: "Home and Living" },
    { name: "Health and Beauty" },
    { name: "Electronics and Gadgets" },
    { name: "Automotive Supplies" },
    { name: "Others" },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: {
        name: category.name,
        isActive: true,
      },
    });
  }

  console.log("Seeding complete! Barangays and categories are ready.");

  // ── SEED ADMIN ACCOUNT ───────────────────────────
  // Creates the default PropeBuy admin account
  // Password is hashed properly using bcrypt
  const adminPassword = "admin123";
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(adminPassword, salt);

  await prisma.user.upsert({
    where: { email: "admin@propebuy.com" },
    update: {},
    create: {
      name: "PropeBuy Admin",
      email: "admin@propebuy.com",
      password: hashedPassword,
      role: "ADMIN",
      accountStatus: "VERIFIED",
    },
  });

  console.log(
    "Seeding complete! Barangays, categories, and admin account ready.",
  );
  console.log("Admin credentials:");
  console.log("  Email    → admin@propebuy.com");
  console.log("  Password → admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
