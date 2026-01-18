import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { OrderSide, OrderStatus } from '../../generated/prisma/client';


@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly orderBook: OrderBookService,
  ) {}

  async placeOrder(data) {
    const order = await this.prisma.order.create({
      data: {
        userId: data.userId,
        stockId: data.stockId,
        side: data.side,
        type: data.type,
        price: data.price,
        quantity: data.quantity,
        status: OrderStatus.OPEN,
      },
    });

    if (data.type === 'LIMIT') {
      if (data.side === OrderSide.BUY) {
        this.orderBook.addBuy(
          data.stockId,
          data.price,
          data.quantity,
        );
      } else {
        this.orderBook.addSell(
          data.stockId,
          data.price,
          data.quantity,
        );
      }
    }

    await this.matchingEngine.processOrder(order.id);
    return order;
  }
}
