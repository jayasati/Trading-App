import { Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const RECENTLY_VIEWED_KEY = 'recently_viewed';
const MAX_RECENTLY_VIEWED = 10;

@Injectable()
export class RedisService implements OnModuleInit {
  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: 'localhost',
      port: 6379,
    });
  }

  getClient() {
    return this.client;
  }

  // ─── Record that a stock was viewed ───
  // Uses a Redis sorted set where score = timestamp (most recent = highest score)
  async recordView(stockId: string): Promise<void> {
    await this.client.zadd(RECENTLY_VIEWED_KEY, Date.now(), stockId);
    // Trim to keep only the 10 most recent (removes lowest scores)
    await this.client.zremrangebyrank(RECENTLY_VIEWED_KEY, 0, -(MAX_RECENTLY_VIEWED + 1));
  }

  // ─── Get top 10 most recently viewed stockIds ───
  // ZREVRANGE returns highest score (most recent) first
  async getRecentlyViewed(): Promise<string[]> {
    return this.client.zrevrange(RECENTLY_VIEWED_KEY, 0, MAX_RECENTLY_VIEWED - 1);
  }

  // ─── Clear recently viewed (useful for testing) ───
  async clearRecentlyViewed(): Promise<void> {
    await this.client.del(RECENTLY_VIEWED_KEY);
  }
}