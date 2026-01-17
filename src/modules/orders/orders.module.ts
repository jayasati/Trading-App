import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrderBookService } from './order-book.service';

@Module({
  controllers: [OrdersController],
  providers: [OrderBookService],
  exports: [OrderBookService],
})
export class OrdersModule {}
