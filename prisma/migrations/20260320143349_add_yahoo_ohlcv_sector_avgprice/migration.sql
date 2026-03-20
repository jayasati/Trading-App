-- Add new columns to Stock (nullable first so existing rows don't break)
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "yahooSymbol" TEXT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "sector" TEXT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "marketCap" DECIMAL(20,2);
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "isinCode" TEXT;

-- Fill yahooSymbol for existing stocks (symbol + ".NS" for NSE)
UPDATE "Stock" SET "yahooSymbol" = symbol || '.NS' WHERE "yahooSymbol" IS NULL;

-- Now make yahooSymbol unique (after filling data)
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_yahooSymbol_key" UNIQUE ("yahooSymbol");

-- Add indexes on Stock
CREATE INDEX IF NOT EXISTS "Stock_symbol_idx" ON "Stock"("symbol");
CREATE INDEX IF NOT EXISTS "Stock_sector_idx" ON "Stock"("sector");

-- Add new columns to Holding
ALTER TABLE "Holding" ADD COLUMN IF NOT EXISTS "avgPrice" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Holding" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add index on Holding
CREATE INDEX IF NOT EXISTS "Holding_userId_idx" ON "Holding"("userId");

-- Add new columns to PriceHistory
ALTER TABLE "PriceHistory" ADD COLUMN IF NOT EXISTS "open"   DECIMAL(18,2);
ALTER TABLE "PriceHistory" ADD COLUMN IF NOT EXISTS "high"   DECIMAL(18,2);
ALTER TABLE "PriceHistory" ADD COLUMN IF NOT EXISTS "low"    DECIMAL(18,2);
ALTER TABLE "PriceHistory" ADD COLUMN IF NOT EXISTS "close"  DECIMAL(18,2);

-- Change volume from INT to BIGINT safely
ALTER TABLE "PriceHistory" ALTER COLUMN "volume" TYPE BIGINT USING "volume"::BIGINT;

-- Add indexes on Order
CREATE INDEX IF NOT EXISTS "Order_userId_status_idx" ON "Order"("userId", "status");
CREATE INDEX IF NOT EXISTS "Order_stockId_status_idx" ON "Order"("stockId", "status");

-- Add index on Trade
CREATE INDEX IF NOT EXISTS "Trade_stockId_idx" ON "Trade"("stockId");