// src/modules/positions/positions.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';
import { WalletModule } from '../wallet/wallet.module';
import { MarketModule } from '../market/market.module';
import { RedisModule } from '../../common/redis/redis.module';


@Module({
  imports: [
    WalletModule,
    // forwardRef needed because MarketModule also imports PositionsModule
    // (for the 3:20 PM auto square-off cron in MarketService)
    forwardRef(() => MarketModule),

    RedisModule,      
  ],
  controllers: [PositionsController],
  providers:   [PositionsService],
  exports:     [PositionsService],
})
export class PositionsModule {}