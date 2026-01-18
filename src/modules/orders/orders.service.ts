import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { OrderSide, OrderStatus, OrderType } from '../../generated/prisma/client';
import { WalletService } from '../wallet/wallet.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly orderBook: OrderBookService,
    private readonly walletService: WalletService,
  ) {}

  async placeOrder(data) {
    // 🔒 STEP 1: LOCK FUNDS (BUY LIMIT ONLY)
    if (data.side === OrderSide.BUY) {
      if (data.type !== OrderType.LIMIT) {
        throw new BadRequestException(
          'Only LIMIT orders supported for BUY right now',
        );
      }

    const amountToLock = new Prisma.Decimal(data.price).mul(new Prisma.Decimal(data.quantity));
    await this.walletService.lockFunds(data.userId,amountToLock);

    }

    // 🧾 STEP 2: CREATE ORDER
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

    // 📚 STEP 3: ADD REAL ORDER TO ORDER BOOK
    if (order.type === OrderType.LIMIT) {
      if (order.side === OrderSide.BUY) {
        this.orderBook.addBuy(order);
      } else {
        this.orderBook.addSell(order);
      }
    }

    // ⚙️ STEP 4: MATCH
    await this.matchingEngine.processOrder(order.id);

    return order;
  }
}
