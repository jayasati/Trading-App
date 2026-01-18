import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrderBookService } from './order-book.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrdersService } from './orders.service';
import { PrismaService } from 'src/prisma/prisma.service';
@Module({
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
