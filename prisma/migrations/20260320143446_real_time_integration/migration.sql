/*
  Warnings:

  - A unique constraint covering the columns `[isinCode]` on the table `Stock` will be added. If there are existing duplicate values, this will fail.
  - Made the column `yahooSymbol` on table `Stock` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Holding" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Stock" ALTER COLUMN "yahooSymbol" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Stock_isinCode_key" ON "Stock"("isinCode");
