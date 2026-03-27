// src/modules/positions/positions.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { Prisma, PositionStatus } from '../../generated/prisma/client';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly redis:   RedisService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // getTradingDate — returns today's date at midnight IST
  // ─────────────────────────────────────────────────────────────────────────
  getTradingDate(): Date {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // addBuy — called when intraday BUY trade executes (inside $transaction)
  // ─────────────────────────────────────────────────────────────────────────
  async addBuy(
    userId:   string,
    stockId:  string,
    quantity: number,
    price:    number,
    tx:       Prisma.TransactionClient,
  ) {
    const tradingDate = this.getTradingDate();
    const buyValue    = new Prisma.Decimal(price * quantity);

    const existing = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: { userId, stockId, tradingDate },
      },
    });

    if (existing) {
      const newBuyQty   = existing.buyQty + quantity;
      const newBuyValue = new Prisma.Decimal(existing.buyValue).add(buyValue);
      const newAvgBuy   = newBuyValue.div(newBuyQty);
      const netQty      = newBuyQty - existing.sellQty;

      await tx.position.update({
        where: { id: existing.id },
        data: {
          buyQty:      newBuyQty,
          buyValue:    newBuyValue,
          avgBuyPrice: newAvgBuy,
          quantity:    Math.max(netQty, 0),
          status:      netQty <= 0 ? PositionStatus.CLOSED : PositionStatus.OPEN,
        },
      });
    } else {
      await tx.position.create({
        data: {
          userId,
          stockId,
          quantity,
          buyQty:      quantity,
          buyValue,
          avgBuyPrice: new Prisma.Decimal(price),
          tradingDate,
          status:      PositionStatus.OPEN,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // addSell — called when intraday SELL trade executes (inside $transaction)
  // ─────────────────────────────────────────────────────────────────────────
  async addSell(
    userId:   string,
    stockId:  string,
    quantity: number,
    price:    number,
    tx:       Prisma.TransactionClient,
  ) {
    const tradingDate = this.getTradingDate();
    const sellValue   = new Prisma.Decimal(price * quantity);

    const existing = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: { userId, stockId, tradingDate },
      },
    });

    if (existing) {
      const newSellQty   = existing.sellQty + quantity;
      const newSellValue = new Prisma.Decimal(existing.sellValue).add(sellValue);
      const newAvgSell   = newSellValue.div(newSellQty);
      const netQty       = existing.buyQty - newSellQty;

      await tx.position.update({
        where: { id: existing.id },
        data: {
          sellQty:      newSellQty,
          sellValue:    newSellValue,
          avgSellPrice: newAvgSell,
          quantity:     Math.max(netQty, 0),
          status:       netQty <= 0 ? PositionStatus.CLOSED : PositionStatus.OPEN,
        },
      });
    } else {
      // Short sell — selling without a prior buy position
      await tx.position.create({
        data: {
          userId,
          stockId,
          quantity:     0,
          sellQty:      quantity,
          sellValue,
          avgSellPrice: new Prisma.Decimal(price),
          tradingDate,
          status:       PositionStatus.OPEN,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getUserPositions — today's positions with live MTM P&L
  // ─────────────────────────────────────────────────────────────────────────
  // ── getUserPositions ── today's positions with live MTM P&L ─────────────────
  // FIXED: now reads live price from Redis cache instead of defaulting to avgBuy.
  // This means the backend response already contains the correct LTP, so the
  // frontend P&L is correct even before the WebSocket fires.
  async getUserPositions(userId: string) {
    const tradingDate = this.getTradingDate();

    const positions = await this.prisma.position.findMany({
      where:   { userId, tradingDate },
      include: { stock: true },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const avgBuy  = Number(pos.avgBuyPrice);
        const avgSell = Number(pos.avgSellPrice);
        const buyQty  = pos.buyQty;
        const sellQty = pos.sellQty;
        const netQty  = pos.quantity;

        // ── Pull live price from Redis cache ──────────────────────────────────
        // Key written by MarketCacheService: `price:{stockId}`
        let livePrice = avgBuy; // safe fallback
        try {
          const cached = await this.prisma.$queryRawUnsafe<{ val: string | null }[]>(
            `SELECT NULL as val` // placeholder — we use RedisService below
          );
          // RedisService is not injected here yet — inject it in the constructor.
          // See constructor fix below.
          const redisVal = await this.redis.getClient().get(`price:${pos.stockId}`);
          if (redisVal) livePrice = Number(redisVal);
        } catch {
          // Redis unavailable — livePrice stays as avgBuy fallback
        }

        const matchedQty    = Math.min(buyQty, sellQty);
        const realisedPnl   = matchedQty > 0 ? (avgSell - avgBuy) * matchedQty : 0;
        const unrealisedPnl = netQty > 0 ? (livePrice - avgBuy) * netQty : 0;
        const totalPnl      = realisedPnl + unrealisedPnl;
        const pnlPct        = avgBuy > 0 ? (totalPnl / (avgBuy * buyQty)) * 100 : 0;

        return {
          id:             pos.id,
          stockId:        pos.stockId,
          symbol:         pos.stock.symbol,
          name:           pos.stock.name,
          exchange:       pos.stock.exchange,
          netQty,
          buyQty,
          sellQty,
          avgBuyPrice:    avgBuy,
          avgSellPrice:   avgSell,
          livePrice,                               // ← now real, not avgBuy
          realisedPnl:    Number(realisedPnl.toFixed(2)),
          unrealisedPnl:  Number(unrealisedPnl.toFixed(2)),
          totalPnl:       Number(totalPnl.toFixed(2)),
          pnlPct:         Number(pnlPct.toFixed(2)),
          status:         pos.status,
          tradingDate:    pos.tradingDate,
        };
      })
    );

    return enriched;
  }

// ── autoSquareOff ── called by cron at 3:20 PM IST ──────────────────────────
  // For intraday BUY positions:
  //   - At order time: wallet locked only 20% margin (price × qty / 5)
  //   - At square-off : we need to return PnL to wallet, not the full trade value
  //
  // Formula:
  //   pnl            = (squareOffPrice - avgBuyPrice) × qty
  //   marginReturned = margin originally locked = avgBuyPrice × qty / 5
  //   creditAmount   = marginReturned + pnl
  //
  // This keeps the wallet consistent regardless of profit or loss.
  async autoSquareOff(
    stockId:  string,
    userId:   string,
    quantity: number,
    price:    number,
  ) {
    const tradingDate = this.getTradingDate();

    return this.prisma.$transaction(async (tx) => {
      const position = await tx.position.findFirst({
        where: { userId, stockId, tradingDate },
      });

      if (position) {
        const avgBuy   = Number(position.avgBuyPrice);
        const margin   = new Prisma.Decimal(avgBuy * quantity).div(5);   // 20% originally locked
        const pnl      = new Prisma.Decimal((price - avgBuy) * quantity); // can be negative
        const credit   = margin.add(pnl);                                  // return margin ± pnl

        // Only credit if result is positive (don't go below 0)
        const safeCredit = credit.gt(0) ? credit : new Prisma.Decimal(0);
        await this.wallet.creditBalance(userId, safeCredit, tx);

        const newSellQty   = position.sellQty + quantity;
        const newSellValue = new Prisma.Decimal(position.sellValue).add(
          new Prisma.Decimal(price * quantity)
        );
        const newAvgSell   = newSellValue.div(newSellQty);

        await tx.position.update({
          where: { id: position.id },
          data: {
            sellQty:      newSellQty,
            sellValue:    newSellValue,
            avgSellPrice: newAvgSell,
            quantity:     0,
            status:       PositionStatus.SQUARED_OFF,
          },
        });

        this.logger.log(
          `Auto square-off: ${quantity} × stockId=${stockId} for userId=${userId} ` +
          `@ ₹${price} | margin=₹${margin} pnl=₹${pnl} credit=₹${safeCredit}`
        );
      } else {
        this.logger.warn(
          `autoSquareOff: no position found for userId=${userId} stockId=${stockId} date=${tradingDate}`
        );
      }
    });
  }
  // ─────────────────────────────────────────────────────────────────────────
  // getAllOpenPositions — used by MarketService cron for square-off
  // ─────────────────────────────────────────────────────────────────────────
  async getAllOpenPositions() {
    const tradingDate = this.getTradingDate();
    return this.prisma.position.findMany({
      where:   { status: PositionStatus.OPEN, tradingDate },
      include: { stock: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // validateIntradaySell — ensures user has an open buy position to sell
  // ─────────────────────────────────────────────────────────────────────────
  async validateIntradaySell(
    userId:   string,
    stockId:  string,
    quantity: number,
  ): Promise<void> {
    const tradingDate = this.getTradingDate();

    const position = await this.prisma.position.findUnique({
      where: {
        userId_stockId_tradingDate: { userId, stockId, tradingDate },
      },
    });

    const available = position ? position.quantity : 0;

    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient intraday position. Available: ${available}, Requested: ${quantity}`
      );
    }
  }
}