import { Module } from '@nestjs/common';
import { HoldingsService } from './holding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PortfolioController } from './portfolio.controller';

@Module({
  controllers:[PortfolioController],
  providers: [HoldingsService, PrismaService],
  exports: [HoldingsService],
})
export class PortfolioModule {}
