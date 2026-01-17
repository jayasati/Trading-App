import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderBookService } from './order-book.service';


@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orderBookService: OrderBookService,
  ) {}

  @Get('book/:stockId')
  getOrderBook(@Param('stockId') stockId: string) {
    return this.orderBookService.getBook(stockId);
  }
}