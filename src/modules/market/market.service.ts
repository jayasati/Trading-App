import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Cron } from '@nestjs/schedule';
import { MarketGateway } from './market.gateway';
import { MarketDataService } from './market-data.service';
import { PositionsService } from '../positions/positions.service';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private isRunning = false;

  constructor(
    private readonly prisma:      PrismaService,
    private readonly redis:       RedisService,
    private readonly gateway:     MarketGateway,
    private readonly marketData:  MarketDataService,
    private readonly positionsService: PositionsService,
  ) {}

  @Cron('20 15 * * 1-5', { timeZone: 'Asia/Kolkata' }) // 3:20 PM IST
  async squareOffIntradayPositions() {
    this.logger.log('🔔 3:20 PM — Auto square-off intraday positions');
    try {
      const openPositions = await this.positionsService.getAllOpenPositions();
      if (!openPositions.length) return;

      for (const pos of openPositions) {
        const quote = await this.marketData.fetchSingleQuote(
          pos.stock.yahooSymbol ?? `${pos.stock.symbol}.NS`
        );
        const price = quote?.price ?? Number(pos.avgBuyPrice);
        await this.positionsService.autoSquareOff(
          pos.stockId, pos.userId, pos.quantity, price
        );
        this.logger.log(`Squared off ${pos.quantity} × ${pos.stock.symbol} @ ₹${price}`);
      }
    } catch (err: any) {
      this.logger.error(`Square-off failed: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // updatePrice — saves to DB, caches in Redis, broadcasts via WS
  // ─────────────────────────────────────────────────────────────
  async updatePrice(
    stockId: string,
    price: number,
    ohlcv?: {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    },
  ) {
    // 1. Save to price history
    await this.prisma.priceHistory.create({
      data: {
        stockId,
        price,
        open:   ohlcv?.open   ?? price,
        high:   ohlcv?.high   ?? price,
        low:    ohlcv?.low    ?? price,
        close:  ohlcv?.close  ?? price,
        volume: ohlcv?.volume ?? 0,
      },
    });

    // 2. Cache price in Redis (70s TTL)
    await this.redis
      .getClient()
      .set(`price:${stockId}`, price.toString(), 'EX', 70);

    // 3. Cache full quote in Redis (70s TTL)
    if (ohlcv) {
      await this.redis
        .getClient()
        .set(
          `quote:${stockId}`,
          JSON.stringify({ price, ...ohlcv, updatedAt: new Date() }),
          'EX',
          70,
        );
    }

    // 4. Broadcast via WebSocket
    this.gateway.broadcastPrice(stockId, price, ohlcv);
  }

  // ─────────────────────────────────────────────────────────────
  // getLatestPrice — Redis first, then DB fallback
  // ─────────────────────────────────────────────────────────────
  async getLatestPrice(stockId: string): Promise<number | null> {
    const cached = await this.redis.getClient().get(`price:${stockId}`);
    if (cached) return Number(cached);

    const latest = await this.prisma.priceHistory.findFirst({
      where:   { stockId },
      orderBy: { timestamp: 'desc' },
    });

    return latest ? Number(latest.price) : null;
  }

  // ─────────────────────────────────────────────────────────────
  // getFullQuote — on-demand fetch + records view in Redis
  // Called when a user clicks on / opens a stock page
  // ─────────────────────────────────────────────────────────────
    async getFullQuote(stockId: string) {
    // Always record the view first — regardless of whether quote fetch succeeds
    await this.redis.recordView(stockId);

    // Check Redis cache
    const cached = await this.redis.getClient().get(`quote:${stockId}`);
    if (cached) {
        return JSON.parse(cached);
    }

    // Cache miss → look up stock
    const stock = await this.prisma.stock.findUnique({
        where: { id: stockId },
    });

    if (!stock?.yahooSymbol) {
        // Stock exists in DB but has no yahooSymbol — still recorded above, return basic info
        return { id: stock?.id, symbol: stock?.symbol, name: stock?.name, quote: null };
    }

    // Fetch live from Yahoo Finance
    const quote = await this.marketData.fetchSingleQuote(stock.yahooSymbol);

    if (!quote) {
        // Yahoo failed — return stock info without price
        // It's still recorded so it'll appear in recently viewed
        this.logger.warn(`Quote fetch failed for ${stock.symbol}, returning without price`);
        return { id: stock.id, symbol: stock.symbol, name: stock.name, quote: null };
    }

    // Persist + cache + broadcast
    await this.updatePrice(stockId, quote.price, {
        open:   quote.open,
        high:   quote.high,
        low:    quote.low,
        close:  quote.close,
        volume: quote.volume,
    });

    return quote;
    }

  // ─────────────────────────────────────────────────────────────
  // getRecentlyViewed — returns top 10 recently viewed stocks
  // with their latest cached quote. Used for the front page.
  // Zero Yahoo Finance calls — all from Redis + DB.
  // ─────────────────────────────────────────────────────────────
  async getRecentlyViewed() {
    const stockIds = await this.redis.getRecentlyViewed();
    if (!stockIds.length) return [];

    const results = await Promise.all(
      stockIds.map(async (stockId) => {
        const stock = await this.prisma.stock.findUnique({
          where: { id: stockId },
        });

        if (!stock) return null;

        const cached = await this.redis.getClient().get(`quote:${stockId}`);

        return {
          id:          stock.id,
          symbol:      stock.symbol,
          name:        stock.name,
          exchange:    stock.exchange,
          yahooSymbol: stock.yahooSymbol,
          sector:      stock.sector,
          quote:       cached ? JSON.parse(cached) : null,
        };
      }),
    );

    return results.filter(Boolean);
  }

  // ─────────────────────────────────────────────────────────────
  // getPriceHistory — chart data for a stock
  // ─────────────────────────────────────────────────────────────
  async getPriceHistory(
    stockId: string,
    period: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M',
  ) {
    const stock = await this.prisma.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock?.yahooSymbol) return [];

    const bars = await this.marketData.getHistoricalData(stock.yahooSymbol, period);
    return bars;
  }

  // ─────────────────────────────────────────────────────────────
  // CRON — runs every 5 minutes
  // Only refreshes the (max 10) recently viewed stocks.
  // 160 stocks → barely 10 = ~94% fewer Yahoo Finance calls.
  // ─────────────────────────────────────────────────────────────
 // ─── Add this helper at the top of the class ───
 private isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 540 && mins <= 930; // 9:00–15:30
}

@Cron('*/10 * * * * *')
async fetchRealMarketPrices() {
  if (this.isRunning) return;
  this.isRunning = true;

  try {
    const stockIds = await this.redis.getRecentlyViewed();
    if (!stockIds.length) return;

    const stocks = await this.prisma.stock.findMany({
      where: { id: { in: stockIds }, isActive: true },
      select: { id: true, symbol: true, yahooSymbol: true },
    });

    // ── Outside market hours: only fetch stocks that have NO cached price ──
    // During market hours: fetch all to get live updates
    const stocksToFetch = this.isMarketOpen()
      ? stocks
      : await this.filterUncached(stocks); // only missing ones

    if (!stocksToFetch.length) return; // everything already cached, do nothing

    const yahooSymbols = stocksToFetch.map(s => s.yahooSymbol).filter(Boolean) as string[];
    const quotes       = await this.marketData.getLiveQuotes(yahooSymbols);
    const quoteMap     = new Map(quotes.map(q => [q.yahooSymbol, q]));

    // Outside market hours → cache for 12 hours so we don't call Yahoo again
    const cacheTTL = this.isMarketOpen() ? 70 : 43200; // 70s live | 12h offline

    let updated = 0;
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

      // Save to DB
      await this.prisma.priceHistory.create({
        data: {
          stockId: stock.id,
          price:   quote.price,
          open:    quote.open,
          high:    quote.high,
          low:     quote.low,
          close:   quote.close,
          volume:  quote.volume,
        },
      });

      // Cache with appropriate TTL
      await this.redis.getClient().set(
        `price:${stock.id}`,
        quote.price.toString(),
        'EX', cacheTTL,
      );
      await this.redis.getClient().set(
        `quote:${stock.id}`,
        JSON.stringify({ price: quote.price, open: quote.open, high: quote.high,
          low: quote.low, close: quote.close, volume: quote.volume, updatedAt: new Date() }),
        'EX', cacheTTL,
      );

      this.gateway.broadcastPrice(stock.id, quote.price, quote);
      updated++;
    }

    if (updated > 0) {
      this.logger.log(
        `✅ Refreshed ${updated} stocks (${this.isMarketOpen() ? 'LIVE' : 'after-hours cache'})`
      );
    }
  } catch (err: any) {
    this.logger.error(`Cron failed: ${err.message}`);
  } finally {
    this.isRunning = false;
  }
}

  // In market.service.ts — update getStockDetail:
  async getStockDetail(stockId: string) {
    const stock = await this.prisma.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock) return null;

    let quote: any = null;

    const cached = await this.redis.getClient().get(`quote:${stockId}`);
    if (cached) {
      quote = JSON.parse(cached);
    } else if (stock.yahooSymbol) {
      const live = await this.marketData.fetchSingleQuote(stock.yahooSymbol);
      if (live) {
        await this.updatePrice(stockId, live.price, {
          open: live.open, high: live.high,
          low:  live.low,  close: live.close, volume: live.volume,
        });
        await this.redis.recordView(stockId);
        quote = live;
      }
    }

    // ← Wrap in try/catch so Yahoo failure doesn't kill the whole response
    let fundamentals: any = null;
    try {
      if (stock.yahooSymbol) {
        fundamentals = await this.marketData.fetchDetail(stock.yahooSymbol);
      }
    } catch {
      fundamentals = null;
    }

    // ← Always return stock data even if quote/fundamentals are null
    return {
      id:          stock.id,
      symbol:      stock.symbol,
      name:        stock.name,
      exchange:    stock.exchange,
      yahooSymbol: stock.yahooSymbol,
      sector:      fundamentals?.sector   ?? (stock as any).sector   ?? null,
      industry:    fundamentals?.industry ?? (stock as any).industry ?? null,
      quote,
      fundamentals,
    };
  }
 
  async getStockNews(stockId: string) {
    const stock = await this.prisma.stock.findUnique({
      where: { id: stockId },
    });
 
    if (!stock?.yahooSymbol) return [];
 
    // No sector param needed — RSS feed is inherently ticker-specific
    return this.marketData.fetchNews(stock.yahooSymbol);
  }
  
// Returns only stocks that don't have a cached quote yet
  private async filterUncached(
    stocks: Array<{ id: string; symbol: string; yahooSymbol: string | null }>
  ): Promise<Array<{ id: string; symbol: string; yahooSymbol: string | null }>> {
    const uncached: Array<{ id: string; symbol: string; yahooSymbol: string | null }> = [];
    for (const stock of stocks) {
      const cached = await this.redis.getClient().get(`quote:${stock.id}`);
      if (!cached) uncached.push(stock);
    }
    return uncached;
  }
}