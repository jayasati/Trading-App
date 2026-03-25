// src/modules/market/market.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketGateway } from './gateways/market.gateway';
import { MarketDataService } from './services/market-data.service';
import { MarketCacheService } from './services/market-cache.service';
import { MarketBroadcastService } from './services/market-broadcast.service';
import { MarketCronService } from './services/market-cron.service';
import { RedisModule } from '../../common/redis/redis.module';
import { PositionsModule } from '../positions/positions.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    RedisModule,
    WalletModule,                        // ← needed by cancelUnfilledOrdersAtClose
    forwardRef(() => PositionsModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [MarketController],
  providers: [
    MarketService,
    MarketGateway,
    MarketDataService,
    MarketCacheService,
    MarketBroadcastService,
    MarketCronService,
  ],
  exports: [MarketService, MarketDataService],
})
export class MarketModule {}