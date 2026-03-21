import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class HoldingsService {
  constructor(private prisma: PrismaService) {}

  // ─── Add holding with weighted average price ───
  async addHolding(
    userId:   string,
    stockId:  string,
    quantity: number,
    tx:       Prisma.TransactionClient,
    tradePrice?: number,
  ) {
    const existing = await tx.holding.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });

    if (existing) {
      // Weighted average price formula:
      // newAvg = (oldAvg * oldQty + tradePrice * newQty) / (oldQty + newQty)
      const oldQty   = existing.quantity;
      const oldAvg   = Number(existing.avgPrice);
      const price    = tradePrice ?? oldAvg;
      const newQty   = oldQty + quantity;
      const newAvg   = ((oldAvg * oldQty) + (price * quantity)) / newQty;

      await tx.holding.update({
        where: { id: existing.id },
        data: {
          quantity: { increment: quantity },
          avgPrice: new Prisma.Decimal(newAvg.toFixed(2)),
        },
      });
    } else {
      // First time buying this stock
      await tx.holding.create({
        data: {
          userId,
          stockId,
          quantity,
          avgPrice: new Prisma.Decimal((tradePrice ?? 0).toFixed(2)),
        },
      });
    }
  }

  // ─── Remove holding when selling ───
  async removeHolding(
    userId:   string,
    stockId:  string,
    quantity: number,
    tx:       Prisma.TransactionClient,
  ) {
    const holding = await tx.holding.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });

    if (!holding || holding.quantity < quantity) {
      throw new Error('Insufficient holdings');
    }

    if (holding.quantity === quantity) {
      // Sold everything — delete the row
      await tx.holding.delete({
        where: { id: holding.id },
      });
    } else {
      // Partial sell — avgPrice stays the same (cost basis doesn't change on sell)
      await tx.holding.update({
        where: { id: holding.id },
        data: {
          quantity:  { decrement: quantity },
          lockedQty: { decrement: quantity },
        },
      });
    }
  }

  // ─── Get all holdings for a user with stock info ───
  async getUserHoldings(userId: string) {
    return this.prisma.holding.findMany({
      where: { userId },
      include: { stock: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}