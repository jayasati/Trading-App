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

// External Modules
import { RedisModule } from '../../common/redis/redis.module';
import { PositionsModule } from '../positions/positions.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    RedisModule,
    WalletModule,
    forwardRef(() => PositionsModule),
    forwardRef(() => OrdersModule),
  ],

  controllers: [MarketController],

  providers: [
    // Core
    MarketService,
    MarketGateway,

    // Infra
    MarketDataService,
    MarketCacheService,
    MarketBroadcastService,

    // Cron
    MarketCronService,

    // Jobs (🔥 NEW)
    PriceRefreshJob,
    OrderRetryJob,
    CancelOrdersJob,
    SquareOffJob,

    // Domain (🔥 NEW)
    DepthBuilderService,
    TickSizeService,
    OrderGroupingService,
    PriceProcessorService,
  ],

  exports: [
    MarketService,
    MarketDataService,
  ],
})
export class MarketModule {}