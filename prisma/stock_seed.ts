import * as dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
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
  const stocks = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TCS', name: 'Tata Consultancy Services' },
    { symbol: 'INFY', name: 'Infosys' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank' },
    { symbol: 'SBIN', name: 'State Bank of India' },
    { symbol: 'ITC', name: 'ITC Ltd' },
    { symbol: 'LT', name: 'Larsen & Toubro' },
    { symbol: 'KOTAKBANK', name: 'Kotak Bank' },
    { symbol: 'AXISBANK', name: 'Axis Bank' },
  ];

  for (const stock of stocks) {
    await prisma.stock.create({
      data: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: 'NSE',
        isActive: true,
      },
    });
  }

  console.log('✅ Stocks seeded');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });