import { Injectable, Logger } from '@nestjs/common';
import { YahooAuthService } from './yahoo-auth.service';

@Injectable()
export class YahooSearchService {
  private readonly logger = new Logger(YahooSearchService.name);

  constructor(private readonly auth: YahooAuthService) {}

  async search(query: string) {
    try {
      await this.auth.init();

      const url =
        `https://query1.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(query)}` +
        `&newsCount=0` +
        `&crumb=${encodeURIComponent(this.auth.getCrumb())}`;

      const res = await fetch(url, {
        headers: {
          ...this.auth.getHeaders(),
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const quotes = (data?.quotes ?? []) as any[];

      return quotes
        .filter((q: any) => q.exchDisp === 'NSE' || q.exchDisp === 'BSE')
        .slice(0, 10)
        .map((q: any) => ({
          symbol: q.symbol?.replace('.NS', '').replace('.BO', ''),
          name: q.longname ?? q.shortname ?? q.symbol,
          exchange: q.exchDisp,
          yahooSymbol: q.symbol,
        }));
    } catch (err: any) {
      this.logger.warn(`Search failed for "${query}": ${err.message}`);
      return [];
    }
  }
}