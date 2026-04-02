import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

const RECENTLY_VIEWED_KEY = 'recently_viewed';
const MAX_RECENTLY_VIEWED = 10;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  private createClient(): Redis {
    const host = process.env.REDIS_HOST ?? '127.0.0.1';
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const db = Number(process.env.REDIS_DB ?? 0);
    const password = process.env.REDIS_PASSWORD;

    const options: RedisOptions = {
      host,
      port: Number.isFinite(port) ? port : 6379,
      db: Number.isFinite(db) ? db : 0,
      password: password || undefined,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    };

    const client = new Redis(options);

    client.on('connect', () => {
      this.logger.log(`Redis connected (${host}:${options.port})`);
    });
    client.on('ready', () => {
      this.logger.log('Redis ready');
    });
    client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
    client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    return client;
  }

  onModuleInit() {
    this.client = this.createClient();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient() {
    if (!this.client) {
      this.client = this.createClient();
    }
    return this.client;
  }

  // ─── Record that a stock was viewed ───
  // Uses a Redis sorted set where score = timestamp (most recent = highest score)
  async recordView(stockId: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.zadd(RECENTLY_VIEWED_KEY, Date.now(), stockId);
      // Trim to keep only the 10 most recent (removes lowest scores)
      await client.zremrangebyrank(RECENTLY_VIEWED_KEY, 0, -(MAX_RECENTLY_VIEWED + 1));
    } catch (error) {
      this.logger.warn(`recordView failed: ${(error as Error).message}`);
    }
  }

  // ─── Get top 10 most recently viewed stockIds ───
  // ZREVRANGE returns highest score (most recent) first
  async getRecentlyViewed(): Promise<string[]> {
    try {
      return await this.getClient().zrevrange(RECENTLY_VIEWED_KEY, 0, MAX_RECENTLY_VIEWED - 1);
    } catch (error) {
      this.logger.warn(`getRecentlyViewed failed: ${(error as Error).message}`);
      return [];
    }
  }

  // ─── Clear recently viewed (useful for testing) ───
  async clearRecentlyViewed(): Promise<void> {
    try {
      await this.getClient().del(RECENTLY_VIEWED_KEY);
    } catch (error) {
      this.logger.warn(`clearRecentlyViewed failed: ${(error as Error).message}`);
    }
  }
}