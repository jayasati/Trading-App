import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/gaurds/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // POST /orders — place a new order
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  placeOrder(@GetUser() user: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.placeOrder({ ...dto, userId: user.userId });
  }

  // GET /orders — get all orders for the logged-in user
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED'] })
  @ApiQuery({ name: 'side',   required: false, enum: ['BUY', 'SELL'] })
  @Get()
  getOrders(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('side')   side?: string,
  ) {
    return this.ordersService.getUserOrders(user.userId, { status, side });
  }

  // DELETE /orders/:id — cancel an open order
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  cancelOrder(@GetUser() user: any, @Param('id') id: string) {
    return this.ordersService.cancelOrder(id, user.userId);
  }
}