import { Injectable } from '@nestjs/common';
import { YahooQuoteService } from '../integrations/yahoo/yahoo-quote.service';
import { YahooDetailService } from '../integrations/yahoo/yahoo-detail.service'; // Bug fix: add import
import { NewsService } from '../news/news.service';
import { YahooChartService } from '../integrations/yahoo/yahoo-chart.service';
import { QuoteMapper } from '../mappers/quote.mapper';
import { YahooSearchService } from '../integrations/yahoo/yahoo-search.service';
import { Quote } from '../types/market.types';

@Injectable()
export class MarketDataService {
  constructor(
    private quoteService:  YahooQuoteService,
    private detailService: YahooDetailService, // Bug fix: inject detail service
    private newsService:   NewsService,
    private chartService:  YahooChartService,
    private searchService: YahooSearchService,
  ) {}

  async getLiveQuotes(symbols: string[]): Promise<Quote[]> {
    const raw = await this.quoteService.fetchQuotes(symbols);
    return raw.map(QuoteMapper.map);
  }

  async fetchSingleQuote(symbol: string): Promise<Quote | null> {
    const res = await this.getLiveQuotes([symbol]);
    if (!res.length) return null;
    return res[0];
  }

  // Bug fix: this method was completely missing from the new modular service
  // but market.service.ts still calls this.marketData.fetchDetail(...).
  // Caused TypeScript error: "Property 'fetchDetail' does not exist on type 'MarketDataService'"
  async fetchDetail(yahooSymbol: string): Promise<any> {
    return this.detailService.fetchDetail(yahooSymbol);
  }

  async fetchNews(symbol: string) {
    return this.newsService.fetch(symbol);
  }

  async getHistoricalData(
    symbol: string,
    period: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y',
  ) {
    return this.chartService.fetch(symbol, period);
  }

  async searchStock(query: string) {
    return this.searchService.search(query);
  }
}