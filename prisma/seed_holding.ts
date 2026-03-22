/**
 * seed-holdings.ts
 *
 * Populates every user's holdings with a diversified ₹10L portfolio
 * priced at approximate 6-month-ago levels (current price × sector multiplier).
 *
 * Run:
 *   npx ts-node --project tsconfig.json prisma/seed-holdings.ts
 *
 * Safe to re-run — uses upsert so existing holdings are updated, not duplicated.
 */
import * as dotenv from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Decimal } from '@prisma/client/runtime/client';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

// ── Sector multipliers ────────────────────────────────────────────────────────
// Simulates price 6 months ago relative to today.
// IT/Pharma corrected down, Banking/Energy ran up — realistic for Indian markets.
const SECTOR_MULTIPLIER: Record<string, number> = {
  'Information Technology': 0.82,
  'Technology':             0.82,
  'Banking':                0.91,
  'Financial Services':     0.89,
  'Energy':                 0.94,
  'Oil & Gas':              0.94,
  'Automobile':             0.88,
  'Auto':                   0.88,
  'Pharmaceuticals':        0.85,
  'Healthcare':             0.85,
  'FMCG':                   0.93,
  'Consumer':               0.93,
  'Metals':                 0.78,
  'Steel':                  0.78,
  'Cement':                 0.90,
  'Telecom':                0.95,
  'Realty':                 0.80,
  'Default':                0.88,
};

// ── Portfolio allocation per user (10 stocks, ~₹1L each = ₹10L total) ───────
// Symbols must exist in your stocks table.
// Allocation is the fraction of ₹10L assigned to each stock.
const PORTFOLIO_SYMBOLS = [
  { symbol: 'RELIANCE',   allocation: 0.15 },
  { symbol: 'TCS',        allocation: 0.12 },
  { symbol: 'HDFCBANK',   allocation: 0.12 },
  { symbol: 'INFY',       allocation: 0.10 },
  { symbol: 'ICICIBANK',  allocation: 0.10 },
  { symbol: 'SBIN',       allocation: 0.08 },
  { symbol: 'KOTAKBANK',  allocation: 0.08 },
  { symbol: 'WIPRO',      allocation: 0.08 },
  { symbol: 'TITAN',      allocation: 0.09 },
  { symbol: 'ITC',        allocation: 0.08 },
];

const TOTAL_INVESTMENT = 1_000_000; // ₹10,00,000

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDecimal(n: number): typeof Decimal.prototype {
  return new Decimal(n.toFixed(2));
}

function getSectorMultiplier(sector: string | null): number {
  if (!sector) return SECTOR_MULTIPLIER['Default'];
  for (const [key, val] of Object.entries(SECTOR_MULTIPLIER)) {
    if (sector.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return SECTOR_MULTIPLIER['Default'];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  Starting holdings seed…\n');

  // 1. Fetch all users
  const users = await prisma.user.findMany({
    include: { wallet: true },
  });

  if (!users.length) {
    console.error('❌  No users found. Create users first.');
    process.exit(1);
  }
  console.log(`👥  Found ${users.length} user(s): ${users.map(u => u.email).join(', ')}\n`);

  // 2. Resolve stocks from DB
  const symbols = PORTFOLIO_SYMBOLS.map(p => p.symbol);
  const stocks  = await prisma.stock.findMany({
    where: { symbol: { in: symbols }, isActive: true },
  });

  if (!stocks.length) {
    console.error('❌  No matching stocks found. Check your stocks table.');
    process.exit(1);
  }

  const stockMap = new Map(stocks.map(s => [s.symbol, s]));
  console.log(`📈  Resolved ${stocks.length}/${symbols.length} stocks from DB\n`);

  // Warn about missing symbols
  for (const { symbol } of PORTFOLIO_SYMBOLS) {
    if (!stockMap.has(symbol)) {
      console.warn(`⚠️   Symbol not found in DB, skipping: ${symbol}`);
    }
  }
  console.log('');

  // 3. Fetch current prices from PriceHistory (latest per stock)
  const priceHistories = await prisma.priceHistory.findMany({
    where:   { stockId: { in: stocks.map(s => s.id) } },
    orderBy: { timestamp: 'desc' },
    distinct: ['stockId'],
  });

  const priceMap = new Map(
    priceHistories.map(ph => [ph.stockId, Number(ph.price)])
  );

  // 4. Seed holdings for each user
  for (const user of users) {
    console.log(`\n── Seeding holdings for ${user.email} ──`);

    let totalInvested = 0;

    for (const { symbol, allocation } of PORTFOLIO_SYMBOLS) {
      const stock = stockMap.get(symbol);
      if (!stock) continue;

      // Current price from price history, fallback to a reasonable default
      const currentPrice = priceMap.get(stock.id) ?? 1000;

      // Simulate 6-month-ago price
      const multiplier  = getSectorMultiplier(stock.sector);
      const avgPrice    = currentPrice * multiplier;

      // How many shares fit in the allocation?
      const allocationAmount = TOTAL_INVESTMENT * allocation;
      const quantity         = Math.max(1, Math.floor(allocationAmount / avgPrice));
      const actualInvested   = avgPrice * quantity;

      totalInvested += actualInvested;

      await prisma.holding.upsert({
        where: {
          userId_stockId: {
            userId:  user.id,
            stockId: stock.id,
          },
        },
        update: {
          quantity: quantity,
          avgPrice: toDecimal(avgPrice),
        },
        create: {
          userId:   user.id,
          stockId:  stock.id,
          quantity: quantity,
          avgPrice: toDecimal(avgPrice),
        },
      });

      console.log(
        `  ✓ ${symbol.padEnd(12)} | ` +
        `6M price: ₹${avgPrice.toFixed(2).padStart(10)} | ` +
        `qty: ${String(quantity).padStart(5)} | ` +
        `invested: ₹${actualInvested.toFixed(2)}`
      );
    }

    // 5. Deduct total invested from wallet
    if (user.wallet) {
      const currentBalance = Number(user.wallet.balance);
      const newBalance     = Math.max(0, currentBalance - totalInvested);

      await prisma.wallet.update({
        where: { userId: user.id },
        data:  { balance: toDecimal(newBalance) },
      });

      console.log(`\n  💰 Wallet: ₹${currentBalance.toFixed(2)} → ₹${newBalance.toFixed(2)}`);
      console.log(`  📊 Total invested: ₹${totalInvested.toFixed(2)}`);
    } else {
      console.warn(`  ⚠️  No wallet found for ${user.email} — skipping balance deduction`);
    }
  }

  console.log('\n\n✅  Holdings seed complete!\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });