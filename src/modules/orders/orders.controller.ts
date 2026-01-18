import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderBookService } from './order-book.service';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orderBookService: OrderBookService,
    private readonly ordersService:OrdersService,
  ) {}

  @Get('book/:stockId')
  getOrderBook(@Param('stockId') stockId: string) {
    return this.orderBookService.getBook(stockId);
  }

  @Post()
  placeOrder(@Body() body) {
    return this.ordersService.placeOrder(body);
  }
}