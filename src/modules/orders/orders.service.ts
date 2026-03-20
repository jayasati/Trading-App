import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { HoldingsService } from '../portfolio/holding.service';
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
    private readonly holdingsService: HoldingsService,
  ) {}

    async placeOrder(data: any) {
      // BUY → lock funds
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

      // SELL → validate holdings
      if (data.side === OrderSide.SELL) {
        const holding = await this.prisma.holding.findUnique({
          where: {
            userId_stockId: {
              userId: data.userId,
              stockId: data.stockId,
            },
          },
        });
        
        if (!holding) {
          throw new BadRequestException('No holdings found');
        }

        const available = (holding?.quantity || 0) - (holding?.lockedQty || 0);

        if (available < data.quantity) {
          throw new BadRequestException('Insufficient available holdings');
        }

        // 🔒 LOCK SHARES
        await this.prisma.holding.update({
          where: { id: holding.id },
          data: {
            lockedQty: { increment: data.quantity },
          },
        });
      }
      // 🧾 Create order
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

      // 📘 Add to orderbook
      this.orderBook.addOrder(order);

      // ⚙️ Match order
      await this.matchingEngine.processOrder(order.id);

      return order;
    }
}