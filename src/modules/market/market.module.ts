// src/modules/market/market.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketGateway } from './market.gateway';
import { MarketDataService } from './market-data.service';
import { TradeSettlementService } from './trade-settlement.service';
import { PrismaModule } from 'src/prisma/prisam.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { WalletModule } from '../wallet/wallet.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PositionsModule } from '../positions/positions.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    WalletModule,
    PortfolioModule,
    // forwardRef needed because PositionsModule also imports MarketModule
    forwardRef(() => PositionsModule),
  ],
  providers: [
    MarketService,
    MarketGateway,
    MarketDataService,
    TradeSettlementService,
  ],
  controllers: [MarketController],
  exports: [
    MarketService,
    MarketDataService,
    TradeSettlementService,
  ],
})
export class MarketModule {}