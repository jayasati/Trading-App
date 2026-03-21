// Responsibility: ONLY Redis read/write for price/quote data
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

const LIVE_TTL     = 1;       // seconds — during market hours
const OFFLINE_TTL  = 43_200;   // 12 hours — after hours

@Injectable()
export class MarketCacheService {
  constructor(private readonly redis: RedisService) {}

  async getPrice(stockId: string): Promise<number | null> {
    const val = await this.redis.getClient().get(`price:${stockId}`);
    return val ? Number(val) : null;
  }

  async getQuote(stockId: string): Promise<any | null> {
    const val = await this.redis.getClient().get(`quote:${stockId}`);
    return val ? JSON.parse(val) : null;
  }

  async setPrice(stockId: string, price: number, isMarketOpen: boolean) {
    const ttl = isMarketOpen ? LIVE_TTL : OFFLINE_TTL;
    await this.redis.getClient().set(`price:${stockId}`, price.toString(), 'EX', ttl);
  }

  async setQuote(stockId: string, quote: object, isMarketOpen: boolean) {
    const ttl = isMarketOpen ? LIVE_TTL : OFFLINE_TTL;
    await this.redis.getClient().set(
      `quote:${stockId}`,
      JSON.stringify({ ...quote, updatedAt: new Date() }),
      'EX', ttl,
    );
  }

  async isCached(stockId: string): Promise<boolean> {
    const val = await this.redis.getClient().get(`quote:${stockId}`);
    return val !== null;
  }
}