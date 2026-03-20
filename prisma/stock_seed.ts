import * as dotenv from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});


async function main() {
  console.log('🌱 Seeding user wallets + holdings...');

  // 🔍 Get all users
  const users = await prisma.user.findMany();

  if (users.length === 0) {
    throw new Error('No users found. Create users first.');
  }

  // 🔍 Get some stocks
  const stocks = await prisma.stock.findMany({
    take: 5, // use first 5 stocks
  });

  if (stocks.length === 0) {
    throw new Error('No stocks found. Seed stocks first.');
  }

  for (const user of users) {
    console.log(`👉 Seeding for user: ${user.email}`);

    // 💰 WALLET (upsert)
    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {
        balance: new Prisma.Decimal(20000),
        lockedBalance: new Prisma.Decimal(0),
      },
      create: {
        userId: user.id,
        balance: new Prisma.Decimal(20000),
        lockedBalance: new Prisma.Decimal(0),
      },
    });

    // 📊 HOLDINGS
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];

      await prisma.holding.upsert({
        where: {
          userId_stockId: {
            userId: user.id,
            stockId: stock.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          stockId: stock.id,
          quantity: Math.floor(Math.random() * 50) + 10, // 10–60 shares
          lockedQty: 0,
        },
      });
    }
  }

  console.log('✅ User wallets + holdings seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });