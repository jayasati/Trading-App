// Responsibility: ONLY scheduled jobs (price refresh + square-off)
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataService } from './market-data.service';
import { MarketCacheService } from './market-cache.service';
import { MarketBroadcastService } from './market-broadcast.service';
import { PositionsService } from '../../positions/positions.service';

@Injectable()
export class MarketCronService {
  private readonly logger   = new Logger(MarketCronService.name);
  private isRunning         = false;

  constructor(
    private readonly prisma:     PrismaService,
    private readonly redis:      RedisService,
    private readonly marketData: MarketDataService,
    private readonly cache:      MarketCacheService,
    private readonly broadcast:  MarketBroadcastService,
    private readonly positions:  PositionsService,
  ) {}

  private isMarketOpen(): boolean {
    const now  = new Date();
    const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const day  = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return day >= 1 && day <= 5 && mins >= 540 && mins <= 930;
  }

  // ── Refresh recently-viewed stock prices every 10 seconds ──
  @Cron('*/10 * * * * *')
  async fetchRealMarketPrices() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const [recentIds, holdingRows] = await Promise.all([
        this.redis.getRecentlyViewed(),
        this.prisma.holding.findMany({
          where:  { quantity: { gt: 0 } },
          select: { stockId: true },
          distinct: ['stockId'],
        }),
      ]);
      const holdingIds = holdingRows.map((h) => h.stockId);
      const allIds     = [...new Set([...recentIds, ...holdingIds])];
      if (!allIds.length) return;

      this.logger.log(`Recent IDs: ${recentIds.length}`);
      this.logger.log(`Holding IDs: ${holdingIds.length}`);
      this.logger.log(`All IDs to fetch: ${allIds.length}`);


      const marketOpen = this.isMarketOpen();

      const stocks = await this.prisma.stock.findMany({
        where:  { id: { in: allIds  }, isActive: true },
        select: { id: true, symbol: true, yahooSymbol: true },
      });

      const stocksToFetch = marketOpen
        ? stocks
        : await this.filterUncached(stocks);

      if (!stocksToFetch.length) return;

      const yahooSymbols = stocksToFetch
        .map(s => s.yahooSymbol)
        .filter(Boolean) as string[];

      const quotes    = await this.marketData.getLiveQuotes(yahooSymbols);
      const quoteMap  = new Map(quotes.map(q => [q.yahooSymbol, q]));
      let   updated   = 0;

      for (const stock of stocksToFetch) {
        let quote = quoteMap.get(stock.yahooSymbol!);

        if (!quote?.price) {
          quote = await this.marketData.fetchSingleQuote(stock.yahooSymbol!) ?? undefined;
        }
        if (!quote?.price && stock.yahooSymbol?.endsWith('.NS')) {
          const boSymbol = stock.yahooSymbol.replace('.NS', '.BO');
          quote = await this.marketData.fetchSingleQuote(boSymbol) ?? undefined;
        }
        if (!quote?.price) continue;

        await this.prisma.priceHistory.create({
          data: {
            stockId: stock.id,
            price: quote.price, open: quote.open,
            high: quote.high,   low: quote.low,
            close: quote.close, volume: quote.volume,
          },
        });

        await this.cache.setPrice(stock.id, quote.price, marketOpen);
        await this.cache.setQuote(stock.id, quote, marketOpen);
        this.broadcast.broadcast(stock.id, quote.price, quote);
        updated++;
      }

      if (updated > 0) {
        this.logger.log(
          `✅ Refreshed ${updated} stocks (${marketOpen ? 'LIVE' : 'after-hours cache'})`
        );
      }
    } catch (err: any) {
      this.logger.error(`Cron failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  // ── Auto square-off intraday positions at 3:20 PM IST ──
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