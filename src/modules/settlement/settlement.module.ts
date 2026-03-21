import { Module } from '@nestjs/common';
import { TradeSettlementService } from './trade-settlement.service';
import { WalletModule } from '../wallet/wallet.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PositionsModule } from '../positions/positions.module';

@Module({
  imports: [WalletModule, PortfolioModule, PositionsModule],
  providers: [TradeSettlementService],
  exports: [TradeSettlementService],
})
export class SettlementModule {}