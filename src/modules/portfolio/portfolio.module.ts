import { Module } from '@nestjs/common';
import { HoldingsService } from './holding.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [HoldingsService, PrismaService],
  exports: [HoldingsService],
})
export class PortfolioModule {}
