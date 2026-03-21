-- CreateEnum
CREATE TYPE "OrderCategory" AS ENUM ('DELIVERY', 'INTRADAY');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'SQUARED_OFF');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "category" "OrderCategory" NOT NULL DEFAULT 'DELIVERY';

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgBuyPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "avgSellPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buyQty" INTEGER NOT NULL DEFAULT 0,
    "sellQty" INTEGER NOT NULL DEFAULT 0,
    "buyValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "tradingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_stockId_tradingDate_key" ON "Position"("userId", "stockId", "tradingDate");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
