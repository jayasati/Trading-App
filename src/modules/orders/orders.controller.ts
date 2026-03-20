import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/gaurds/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';


@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  placeOrder(
    @GetUser() user: any,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.placeOrder({
      ...dto,
      userId: user.userId, //  secure
    });
  }
}