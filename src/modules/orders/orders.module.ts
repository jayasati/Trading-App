import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrderBookService } from './order-book.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrdersService } from './orders.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletModule } from '../wallet/wallet.module';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PositionsModule } from '../positions/positions.module';

@Module({
  imports:[WalletModule,
      MarketModule,
      PortfolioModule,
      PositionsModule,
  ],
  controllers: [OrdersController],
  providers: [
      OrderBookService,
      MatchingEngineService,
      OrdersService,
      PrismaService,
    ],
  exports: [OrderBookService],
})
export class OrdersModule {}
