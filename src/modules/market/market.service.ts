// Responsibility: ONLY orchestrate sub-services for controller requests
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { MarketDataService } from './services/market-data.service';
import { MarketCacheService } from './services/market-cache.service';
import { MarketBroadcastService } from './services/market-broadcast.service';

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly redis:      RedisService,
    private readonly marketData: MarketDataService,
    private readonly cache:      MarketCacheService,
    private readonly broadcast:  MarketBroadcastService,
  ) {}

  // ── Helper: is the market currently open? ──────────────────────────────────
  private isMarketOpen(): boolean {
    const now  = new Date();
    const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const day  = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    // Mon–Fri, 09:15 – 15:30 IST
    return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
  }

  // ── Helper: get last known price from priceHistory DB ─────────────────────
  // Used as ultimate fallback when Redis cache is empty AND Yahoo returns null
  // (weekends, holidays, after OFFLINE_TTL expires)
  private async getLastKnownPrice(stockId: string): Promise<{
    price:  number;
    open:   number;
    high:   number;
    low:    number;
    close:  number;
    volume: number;
  } | null> {
    const row = await this.prisma.priceHistory.findFirst({
      where:   { stockId },
      orderBy: { timestamp: 'desc' },
    });
    if (!row) return null;
    return {
      price:  Number(row.price),
      open:   Number(row.open)   || Number(row.price),
      high:   Number(row.high)   || Number(row.price),
      low:    Number(row.low)    || Number(row.price),
      close:  Number(row.close)  || Number(row.price),
      volume: Number(row.volume) || 0,
    };
  }

  async getLatestPrice(stockId: string): Promise<number | null> {
    const cached = await this.cache.getPrice(stockId);
    if (cached) return cached;

    // Fall back to DB if cache is empty (weekend / after OFFLINE_TTL expires)
    const latest = await this.prisma.priceHistory.findFirst({
      where:   { stockId },
      orderBy: { timestamp: 'desc' },
    });
    return latest ? Number(latest.price) : null;
  }

  async getFullQuote(stockId: string) {
    await this.redis.recordView(stockId);

    // ── 1. Try Redis cache first ─────────────────────────────────────────────
    const cached = await this.cache.getQuote(stockId);
    if (cached) {
      // Always broadcast cached price so frontend WebSocket receives a tick
      // even when no new Yahoo fetch happens (fixes "–" on cached loads)
      if (cached.price) {
        this.broadcast.broadcast(stockId, cached.price, cached);
      }
      return cached;
    }

    // ── 2. Cache miss: try Yahoo Finance ────────────────────────────────────
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock?.yahooSymbol) {
      return { id: stock?.id, symbol: stock?.symbol, name: stock?.name, quote: null };
    }

    const quote = await this.marketData.fetchSingleQuote(stock.yahooSymbol);

    if (quote) {
      // Got a live quote — persist, cache, broadcast
      await this.persistAndCache(stockId, quote);
      return quote;
    }

    // ── 3. Yahoo returned null (weekend / holiday / rate-limited) ────────────
    // Fall back to the last recorded price in priceHistory so the frontend
    // always gets a number instead of null / "–".
    const lastKnown = await this.getLastKnownPrice(stockId);
    if (lastKnown) {
      // Build a synthetic quote from DB data
      const syntheticQuote = {
        symbol:      stock.symbol,
        yahooSymbol: stock.yahooSymbol,
        price:       lastKnown.price,
        open:        lastKnown.open,
        high:        lastKnown.high,
        low:         lastKnown.low,
        close:       lastKnown.close,
        volume:      lastKnown.volume,
        change:      0,
        changePct:   0,
        isStale:     true,   // flag so frontend can show "Closed" badge instead of "Live"
      };

      // Cache with long TTL since market is closed — 24 hours
      await this.cache.setPrice(stockId, syntheticQuote.price, false);
      await this.cache.setQuote(stockId, syntheticQuote, false);
      // Broadcast so WebSocket-listening components get the price
      this.broadcast.broadcast(stockId, syntheticQuote.price, syntheticQuote);

      return syntheticQuote;
    }

    // Nothing found at all
    return { id: stock.id, symbol: stock.symbol, name: stock.name, quote: null };
  }

  async getRecentlyViewed() {
    const stockIds = await this.redis.getRecentlyViewed();
    if (!stockIds.length) return [];

    const results = await Promise.all(
      stockIds.map(async (stockId) => {
        const stock  = await this.prisma.stock.findUnique({ where: { id: stockId } });
        if (!stock)  return null;
        let quote    = await this.cache.getQuote(stockId);

        // If no cached quote, try DB fallback (weekend/holiday)
        if (!quote) {
          const lastKnown = await this.getLastKnownPrice(stockId);
          if (lastKnown) {
            quote = { ...lastKnown, isStale: true };
          }
        }

        return {
          id: stock.id, symbol: stock.symbol, name: stock.name,
          exchange: stock.exchange, yahooSymbol: stock.yahooSymbol,
          sector: stock.sector, quote,
        };
      }),
    );
    return results.filter(Boolean);
  }

  async getPriceHistory(
    stockId: string,
    period:  '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M',
  ) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock?.yahooSymbol) return [];
    return this.marketData.getHistoricalData(stock.yahooSymbol, period);
  }

  async getStockDetail(stockId: string) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) return null;

    let quote = await this.cache.getQuote(stockId);

    if (!quote && stock.yahooSymbol) {
      const live = await this.marketData.fetchSingleQuote(stock.yahooSymbol);
      if (live) {
        await this.persistAndCache(stockId, live);
        await this.redis.recordView(stockId);
        quote = live;
      }
    }

    // Weekend/holiday fallback — use last DB price if Yahoo returned nothing
    if (!quote) {
      const lastKnown = await this.getLastKnownPrice(stockId);
      if (lastKnown) {
        quote = { ...lastKnown, isStale: true } as any;
      }
    }

    let fundamentals: Awaited<ReturnType<typeof this.marketData.fetchDetail>> | null = null;
    if (stock.yahooSymbol) {
      try { fundamentals = await this.marketData.fetchDetail(stock.yahooSymbol); }
      catch { /* non-fatal */ }
    }

    return {
      id: stock.id, symbol: stock.symbol, name: stock.name,
      exchange: stock.exchange, yahooSymbol: stock.yahooSymbol,
      sector:   fundamentals?.sector   ?? stock.sector   ?? null,
      industry: fundamentals?.industry ?? stock.industry ?? null,
      quote,
      fundamentals,
    };
  }

  async getStockNews(stockId: string) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock?.yahooSymbol) return [];
    return this.marketData.fetchNews(stock.yahooSymbol);
  }

  // ── Internal helper shared by getFullQuote + cron ─────────────────────────
  async persistAndCache(stockId: string, quote: any) {
    await this.prisma.priceHistory.create({
      data: {
        stockId,
        price: quote.price, open: quote.open,
        high:  quote.high,  low:  quote.low,
        close: quote.close, volume: quote.volume,
      },
    });
    const marketOpen = this.isMarketOpen();
    await this.cache.setPrice(stockId, quote.price, marketOpen);
    await this.cache.setQuote(stockId, quote, marketOpen);
    this.broadcast.broadcast(stockId, quote.price, quote);
  }
}