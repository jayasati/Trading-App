import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import {
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '../../generated/prisma/client';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly orderBook: OrderBookService,
    private readonly walletService: WalletService,
  ) {}

  async placeOrder(data: any) {
    // 🔒 LOCK FUNDS (BUY LIMIT ONLY)
    if (data.side === OrderSide.BUY) {
      if (data.type !== OrderType.LIMIT) {
        throw new BadRequestException('Only LIMIT BUY supported');
      }

      const amountToLock = new Prisma.Decimal(data.price).mul(
        data.quantity,
      );

      await this.walletService.lockFunds(
        data.userId,
        amountToLock,
      );
    }

    // 🧾 CREATE ORDER
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

    // ⚙️ MATCH FIRST (before adding to book)
    await this.matchingEngine.processOrder(order.id);

    // 📚 ADD TO ORDER BOOK (only if not fully filled)
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: order.id },
    });

    if (updatedOrder && updatedOrder.type === OrderType.LIMIT  &&
      updatedOrder.filledQty < updatedOrder.quantity) {

        this.orderBook.addOrder(updatedOrder);
    }

    return updatedOrder || order;
  }
}