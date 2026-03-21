import { Module } from '@nestjs/common';
import { HoldingsService } from './holdings/holding.service';
import { PortfolioController } from './portfolio.controller';

@Module({
  controllers: [PortfolioController],
  providers:   [HoldingsService],   // ← removed PrismaService (it's global)
  exports:     [HoldingsService],
})
export class PortfolioModule {}