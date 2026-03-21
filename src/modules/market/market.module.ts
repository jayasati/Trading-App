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

@Module({
  imports: [
    RedisModule,
    forwardRef(() => PositionsModule),
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