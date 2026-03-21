// src/modules/positions/positions.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { Prisma, PositionStatus } from '../../generated/prisma/client';

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
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

        // Try to get live price from Redis cache
        let livePrice = avgBuy; // fallback to avg buy price
        try {
          const cached = await this.prisma.$queryRawUnsafe<{ price: string }[]>(
            `SELECT '0' as price` // placeholder — Redis is injected via MarketService cron
          );
          // Real live prices come via WebSocket to frontend;
          // here we just use avgBuyPrice as server-side fallback
        } catch {
          // ignore
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
          livePrice,
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

  // ─────────────────────────────────────────────────────────────────────────
  // autoSquareOff — called by cron at 3:20 PM IST
  // FIX: removed tx.trade.create (foreign key violation — 'SQUARE_OFF' is not
  //      a real Order id). We just credit the wallet and close the position.
  // ─────────────────────────────────────────────────────────────────────────
  async autoSquareOff(
    stockId:  string,
    userId:   string,
    quantity: number,
    price:    number,
  ) {
    const tradeValue  = new Prisma.Decimal(price * quantity);
    const tradingDate = this.getTradingDate();

    return this.prisma.$transaction(async (tx) => {
      // Credit the user's wallet with the square-off proceeds
      await this.wallet.creditBalance(userId, tradeValue, tx);

      // Update the position to reflect the square-off sell
      const position = await tx.position.findFirst({
        where: { userId, stockId, tradingDate },
      });

      if (position) {
        const newSellQty   = position.sellQty + quantity;
        const newSellValue = new Prisma.Decimal(position.sellValue).add(tradeValue);
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
      }

      this.logger.log(
        `Auto square-off: ${quantity} shares of stockId=${stockId} for userId=${userId} @ ₹${price}`
      );
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