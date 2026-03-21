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

  async getLatestPrice(stockId: string): Promise<number | null> {
    const cached = await this.cache.getPrice(stockId);
    if (cached) return cached;

    const latest = await this.prisma.priceHistory.findFirst({
      where:   { stockId },
      orderBy: { timestamp: 'desc' },
    });
    return latest ? Number(latest.price) : null;
  }

  async getFullQuote(stockId: string) {
    await this.redis.recordView(stockId);

    const cached = await this.cache.getQuote(stockId);
    if (cached) return cached;

    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock?.yahooSymbol) {
      return { id: stock?.id, symbol: stock?.symbol, name: stock?.name, quote: null };
    }

    const quote = await this.marketData.fetchSingleQuote(stock.yahooSymbol);
    if (!quote) return { id: stock.id, symbol: stock.symbol, name: stock.name, quote: null };

    await this.persistAndCache(stockId, quote);
    return quote;
  }

  async getRecentlyViewed() {
    const stockIds = await this.redis.getRecentlyViewed();
    if (!stockIds.length) return [];

    const results = await Promise.all(
      stockIds.map(async (stockId) => {
        const stock  = await this.prisma.stock.findUnique({ where: { id: stockId } });
        if (!stock)  return null;
        const quote  = await this.cache.getQuote(stockId);
        return { id: stock.id, symbol: stock.symbol, name: stock.name,
                 exchange: stock.exchange, yahooSymbol: stock.yahooSymbol,
                 sector: stock.sector, quote };
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

  // ── Internal helper shared by getFullQuote + cron ──
  async persistAndCache(stockId: string, quote: any) {
    await this.prisma.priceHistory.create({
      data: {
        stockId,
        price: quote.price, open: quote.open,
        high:  quote.high,  low:  quote.low,
        close: quote.close, volume: quote.volume,
      },
    });
    // Cache with live TTL; cron handles after-hours TTL
    await this.cache.setPrice(stockId, quote.price, true);
    await this.cache.setQuote(stockId, quote, true);
    this.broadcast.broadcast(stockId, quote.price, quote);
  }
}