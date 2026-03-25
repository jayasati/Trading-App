// src/modules/market/services/market-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataService } from './market-data.service';
import { MarketCacheService } from './market-cache.service';
import { MarketBroadcastService } from './market-broadcast.service';
import { PositionsService } from '../../positions/positions.service';
import { MatchingEngineService, MarketDepthInput } from '../../orders/matching-engine.service';
import { OrderStatus, OrderCategory, OrderSide } from '../../../generated/prisma/client';
import { isMarketOpen } from '../../../common/utils/market-hours';
import { WalletService } from '../../wallet/wallet.service';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class MarketCronService {
  private readonly logger   = new Logger(MarketCronService.name);
  private isRunning         = false;
  private isRetrying        = false;

  constructor(
    private readonly prisma:         PrismaService,
    private readonly redis:          RedisService,
    private readonly marketData:     MarketDataService,
    private readonly cache:          MarketCacheService,
    private readonly broadcast:      MarketBroadcastService,
    private readonly positions:      PositionsService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly wallet:         WalletService,
  ) {}

  // ── Build depth from live quote ───────────────────────────────────────────
  private async fetchDepth(yahooSymbol: string): Promise<MarketDepthInput | null> {
    try {
      const quote = await this.marketData.fetchSingleQuote(yahooSymbol);
      if (!quote) return null;

      const mid  = quote.price;
      const tick = this.getTickSize(mid);

      const bids = Array.from({ length: 5 }, (_, i) => ({
        price:    parseFloat((mid - i * tick).toFixed(2)),
        quantity: Math.round(5000 * Math.max(0.3, 1 - i * 0.18)),
      }));
      const asks = Array.from({ length: 5 }, (_, i) => ({
        price:    parseFloat((mid + (i + 1) * tick).toFixed(2)),
        quantity: Math.round(5000 * Math.max(0.3, 1 - i * 0.18)),
      }));

      return { bids, asks };
    } catch {
      return null;
    }
  }

  private getTickSize(price: number): number {
    if (price < 10)   return 0.01;
    if (price < 25)   return 0.05;
    if (price < 100)  return 0.10;
    if (price < 500)  return 0.25;
    if (price < 1000) return 0.50;
    if (price < 2500) return 1.00;
    return 5.00;
  }

  // ── Refresh prices every 10 seconds ──────────────────────────────────────
  @Cron('*/10 * * * * *')
  async fetchRealMarketPrices() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const [recentIds, holdingRows] = await Promise.all([
        this.redis.getRecentlyViewed(),
        this.prisma.holding.findMany({
          where:    { quantity: { gt: 0 } },
          select:   { stockId: true },
          distinct: ['stockId'],
        }),
      ]);

      const holdingIds = holdingRows.map((h) => h.stockId);
      const allIds     = [...new Set([...recentIds, ...holdingIds])];
      if (!allIds.length) return;

      const marketOpen = isMarketOpen();
      const stocks     = await this.prisma.stock.findMany({
        where:  { id: { in: allIds }, isActive: true },
        select: { id: true, symbol: true, yahooSymbol: true },
      });

      const stocksToFetch = marketOpen
        ? stocks
        : await this.filterUncached(stocks);

      if (!stocksToFetch.length) return;

      const yahooSymbols = stocksToFetch.map((s) => s.yahooSymbol).filter(Boolean) as string[];
      const quotes       = await this.marketData.getLiveQuotes(yahooSymbols);
      const quoteMap     = new Map(quotes.map((q) => [q.yahooSymbol, q]));
      let   updated      = 0;

      for (const stock of stocksToFetch) {
        let quote = quoteMap.get(stock.yahooSymbol!);
        if (!quote?.price) {
          quote = await this.marketData.fetchSingleQuote(stock.yahooSymbol!) ?? undefined;
        }
        if (!quote?.price && stock.yahooSymbol?.endsWith('.NS')) {
          const bo = stock.yahooSymbol.replace('.NS', '.BO');
          quote    = await this.marketData.fetchSingleQuote(bo) ?? undefined;
        }
        if (!quote?.price) continue;

        await this.prisma.priceHistory.create({
          data: {
            stockId: stock.id,
            price: quote.price, open: quote.open,
            high:  quote.high,  low:  quote.low,
            close: quote.close, volume: quote.volume,
          },
        });
        await this.cache.setPrice(stock.id, quote.price, marketOpen);
        await this.cache.setQuote(stock.id, quote, marketOpen);
        this.broadcast.broadcast(stock.id, quote.price, quote);
        updated++;
      }

      if (updated > 0) this.logger.log(`✅ Refreshed ${updated} stocks`);
    } catch (err: any) {
      this.logger.error(`Price cron failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  // ── Retry open LIMIT orders every 10 seconds ─────────────────────────────
  // ONLY fires during market hours (Mon–Fri 09:15–15:30 IST)
  @Cron('*/10 * * * * *')
  async retryOpenLimitOrders() {
    // ── Hard gate: do nothing outside market hours ────────────────────────
    if (!isMarketOpen()) return;
    if (this.isRetrying) return;
    this.isRetrying = true;

    try {
      const openOrders = await this.prisma.order.findMany({
        where:   {
          status:   { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
          type:     'LIMIT',
          category: OrderCategory.DELIVERY, // only delivery queued orders
        },
        include: { stock: true },
      });

      if (!openOrders.length) return;

      this.logger.log(`🔄 Retrying ${openOrders.length} open LIMIT orders`);

      // Group by stock — one Yahoo fetch per stock
      const byStock = new Map<string, { orderId: string; yahooSymbol: string }[]>();
      for (const o of openOrders) {
        const sym  = (o.stock as any).yahooSymbol ?? `${(o.stock as any).symbol}.NS`;
        const list = byStock.get(o.stockId) ?? [];
        list.push({ orderId: o.id, yahooSymbol: sym });
        byStock.set(o.stockId, list);
      }

      for (const [, orders] of byStock) {
        const depth = await this.fetchDepth(orders[0].yahooSymbol);
        if (!depth) continue;

        for (const { orderId } of orders) {
          await this.matchingEngine.processOrder(orderId, depth);
        }
      }
    } catch (err: any) {
      this.logger.error(`Order retry cron failed: ${err.message}`);
    } finally {
      this.isRetrying = false;
    }
  }

  // ── Cancel all unfilled LIMIT orders at 3:30 PM IST ──────────────────────
  // Any delivery order that wasn't filled by end of trading day gets cancelled
  // and locked funds are released back to the user's wallet.
  @Cron('30 15 * * 1-5', { timeZone: 'Asia/Kolkata' })
  async cancelUnfilledOrdersAtClose() {
    this.logger.log('🔔 3:30 PM — Cancelling all unfilled LIMIT orders');

    try {
      const openOrders = await this.prisma.order.findMany({
        where: {
          status:   { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
          type:     'LIMIT',
          category: OrderCategory.DELIVERY,
        },
      });

      if (!openOrders.length) {
        this.logger.log('No unfilled orders to cancel');
        return;
      }

      let cancelled = 0;

      for (const order of openOrders) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Mark as cancelled
            await tx.order.update({
              where: { id: order.id },
              data:  { status: OrderStatus.CANCELLED },
            });

            const unfilledQty = order.quantity - order.filledQty;
            if (unfilledQty <= 0) return;

            // Release locked funds for BUY orders
            if (order.side === OrderSide.BUY && order.price) {
              const amount = new Prisma.Decimal(Number(order.price) * unfilledQty);
              await this.wallet.releaseFunds(order.userId, amount, tx);
            }

            // Release locked holdings for SELL orders
            if (order.side === OrderSide.SELL) {
              const holding = await tx.holding.findUnique({
                where: { userId_stockId: { userId: order.userId, stockId: order.stockId } },
              });
              if (holding && holding.lockedQty > 0) {
                await tx.holding.update({
                  where: { id: holding.id },
                  data:  { lockedQty: { decrement: Math.min(unfilledQty, holding.lockedQty) } },
                });
              }
            }
          });

          cancelled++;
        } catch (err: any) {
          this.logger.error(`Failed to cancel order ${order.id}: ${err.message}`);
        }
      }

      this.logger.log(`✅ Cancelled ${cancelled} unfilled orders at market close`);
    } catch (err: any) {
      this.logger.error(`End-of-day cancel failed: ${err.message}`);
    }
  }

  // ── Auto square-off intraday positions at 3:20 PM IST ────────────────────
  @Cron('20 15 * * 1-5', { timeZone: 'Asia/Kolkata' })
  async squareOffIntradayPositions() {
    this.logger.log('🔔 3:20 PM — Auto square-off intraday positions');
    try {
      const openPositions = await this.positions.getAllOpenPositions();
      if (!openPositions.length) return;

      for (const pos of openPositions) {
        const quote = await this.marketData.fetchSingleQuote(
          pos.stock.yahooSymbol ?? `${pos.stock.symbol}.NS`,
        );
        const price = quote?.price ?? Number(pos.avgBuyPrice);
        await this.positions.autoSquareOff(pos.stockId, pos.userId, pos.quantity, price);
        this.logger.log(`Squared off ${pos.quantity} × ${pos.stock.symbol} @ ₹${price}`);
      }
    } catch (err: any) {
      this.logger.error(`Square-off failed: ${err.message}`);
    }
  }

  private async filterUncached(
    stocks: Array<{ id: string; symbol: string; yahooSymbol: string | null }>,
  ) {
    const uncached: (typeof stocks[number])[] = [];
    for (const stock of stocks) {
      if (!(await this.cache.isCached(stock.id))) uncached.push(stock);
    }
    return uncached;
  }
}