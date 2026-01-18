/*
  Warnings:

  - You are about to drop the column `balance` on the `Wallet` table. All the data in the column will be lost.
  - Added the required column `availableBalance` to the `Wallet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "balance",
ADD COLUMN     "availableBalance" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "lockedBalance" DECIMAL(18,2) NOT NULL DEFAULT 0;
