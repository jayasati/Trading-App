import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { PrismaModule } from 'src/prisma/prisam.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { MarketGateway } from './market.gateway';
import { TradeSettlementService } from './trade-settlement.service';
import { WalletModule } from '../wallet/wallet.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
@Module({
  imports:[
    PrismaModule,
    RedisModule,
    WalletModule,
    PortfolioModule,
  ],
  providers: [MarketService,MarketGateway,TradeSettlementService],
  controllers: [MarketController],
  exports: [TradeSettlementService],
})
export class MarketModule {}
