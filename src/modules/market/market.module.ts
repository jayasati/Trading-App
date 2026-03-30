import { forwardRef, Module } from '@nestjs/common';

// Controllers
import { MarketController } from './market.controller';

// Core Services
import { MarketService } from './market.service';
import { MarketGateway } from './gateways/market.gateway';

// Infra Services
import { MarketDataService } from './services/market-data.service';
import { MarketCacheService } from './services/market-cache.service';
import { MarketBroadcastService } from './services/market-broadcast.service';

// Cron
import { MarketCronService } from './cron/market-cron.service';

// Jobs
import { PriceRefreshJob } from './jobs/price-refresh.job';
import { OrderRetryJob } from './jobs/order-retry.job';
import { CancelOrdersJob } from './jobs/cancel-orders.job';
import { SquareOffJob } from './jobs/squareoff.job';

// Domain Services
import { DepthBuilderService } from './domain/depth/depth-builder.service';
import { TickSizeService } from './domain/depth/tick-size.service';
import { OrderGroupingService } from './domain/order/order-grouping.service';
import { PriceProcessorService } from './domain/pricing/price-processor.service';

// Yahoo Integrations
import { YahooAuthService } from './integrations/yahoo/yahoo-auth.service';
import { YahooQuoteService } from './integrations/yahoo/yahoo-quote.service';
import { YahooChartService } from './integrations/yahoo/yahoo-chart.service';
import { YahooSearchService } from './integrations/yahoo/yahoo-search.service';
import { YahooDetailService } from './integrations/yahoo/yahoo-detail.service'; // Bug fix: was missing

// News Services
import { NewsService } from './news/news.service';
import { RssNewsService } from './news/rss-news.service';
import { NewsApiService } from './news/newsapi.service';

// External Modules
import { RedisModule } from '../../common/redis/redis.module';
import { PositionsModule } from '../positions/positions.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    RedisModule,
    WalletModule,
    ConfigModule,
    forwardRef(() => PositionsModule),
    forwardRef(() => OrdersModule),
  ],

  controllers: [MarketController],

  providers: [
    // ================= CORE =================
    MarketService,
    MarketGateway,

    // ================= INFRA =================
    MarketDataService,
    MarketCacheService,
    MarketBroadcastService,

    // ================= CRON =================
    MarketCronService,

    // ================= JOBS =================
    PriceRefreshJob,
    OrderRetryJob,
    CancelOrdersJob,
    SquareOffJob,

    // ================= DOMAIN =================
    DepthBuilderService,
    TickSizeService,
    OrderGroupingService,
    PriceProcessorService,

    // ================= YAHOO INTEGRATIONS =================
    YahooAuthService,
    YahooQuoteService,
    YahooChartService,
    YahooSearchService,
    YahooDetailService, // Bug fix: was not registered as a provider

    // ================= NEWS =================
    NewsService,
    RssNewsService,
    NewsApiService,
  ],

  exports: [
    MarketService,
    MarketDataService,
  ],
})
export class MarketModule {}