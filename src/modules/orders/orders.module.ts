// src/modules/orders/orders.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderBookService } from './order-book.service';
import { MatchingEngineService } from './matching-engine.service';
import { DeliveryOrderStrategy } from './strategies/delivery-order.strategy';
import { IntradayOrderStrategy } from './strategies/intraday-order.strategy';
import { WalletModule } from '../wallet/wallet.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PositionsModule } from '../positions/positions.module';
import { SettlementModule } from '../settlement/settlement.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    WalletModule,
    PortfolioModule,
    PositionsModule,
    SettlementModule,
    forwardRef(() => MarketModule),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderBookService,
    MatchingEngineService,
    DeliveryOrderStrategy,
    IntradayOrderStrategy,
  ],
  exports: [
    OrdersService,
    OrderBookService,
    MatchingEngineService,
  ],
})
export class OrdersModule {}