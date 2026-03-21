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

  @Get('recent')                          // ← FIRST, before any :params
  getRecentlyViewed() {
    return this.marketService.getRecentlyViewed();
  }

  @Get('search')                          // ← also before :params
  search(@Query('q') query: string) {
    return this.marketData.searchStock(query);
  }

  @Get('price/:stockId')
  getPrice(@Param('stockId') stockId: string) {
    return this.marketService.getLatestPrice(stockId);
  }

  @Get('quote/:stockId')
  getQuote(@Param('stockId') stockId: string) {
    return this.marketService.getFullQuote(stockId);
  }

  @ApiQuery({ name: 'period', enum: ['1D','1W','1M','3M','1Y','5Y'], required: false })
  @Get('history/:stockId')
  getHistory(
    @Param('stockId') stockId: string,
    @Query('period') period: '1D'|'1W'|'1M'|'3M'|'1Y'|'5Y' = '1M',
  ) {
    return this.marketService.getPriceHistory(stockId, period);
  }

  @Get('detail/:stockId')
  getDetail(@Param('stockId') stockId: string) {
    return this.marketService.getStockDetail(stockId);
  }
  
  // GET /market/news/:stockId
  @Get('news/:stockId')
  getNews(@Param('stockId') stockId: string) {
    return this.marketService.getStockNews(stockId);
  }
}
