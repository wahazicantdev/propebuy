import { PrismaClient } from "@prisma/client";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
