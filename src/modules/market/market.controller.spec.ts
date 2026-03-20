import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { MarketService } from './market.service';
import { MarketDataService } from './market-data.service';

@ApiTags('Market')
@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketData:    MarketDataService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // GET /market/recent
  // Returns top 10 recently viewed stocks with cached quotes.
  // Used by the front page — zero Yahoo Finance calls.
  // ─────────────────────────────────────────────────────────
  @Get('recent')
  getRecentlyViewed() {
    return this.marketService.getRecentlyViewed();
  }

  // ─────────────────────────────────────────────────────────
  // GET /market/price/:stockId
  // Returns the latest cached price for a stock.
  // ─────────────────────────────────────────────────────────
  @Get('price/:stockId')
  getPrice(@Param('stockId') stockId: string) {
    return this.marketService.getLatestPrice(stockId);
  }

  // ─────────────────────────────────────────────────────────
  // GET /market/quote/:stockId
  // Returns full OHLCV quote.
  // On cache miss → fetches live from Yahoo Finance.
  // Also records this stock as "viewed" in Redis.
  // ─────────────────────────────────────────────────────────
  @Get('quote/:stockId')
  getQuote(@Param('stockId') stockId: string) {
    return this.marketService.getFullQuote(stockId);
  }

  // ─────────────────────────────────────────────────────────
  // GET /market/history/:stockId?period=1M
  // Returns OHLCV bars for charting.
  // ─────────────────────────────────────────────────────────
  @ApiQuery({
    name:     'period',
    enum:     ['1D', '1W', '1M', '3M', '1Y', '5Y'],
    required: false,
  })
  @Get('history/:stockId')
  getHistory(
    @Param('stockId') stockId: string,
    @Query('period') period: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M',
  ) {
    return this.marketService.getPriceHistory(stockId, period);
  }

  // ─────────────────────────────────────────────────────────
  // GET /market/search?q=reliance
  // Searches Yahoo Finance directly.
  // Called only when the user types in the search box.
  // ─────────────────────────────────────────────────────────
  @Get('search')
  search(@Query('q') query: string) {
    return this.marketData.searchStock(query);
  }
}