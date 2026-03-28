import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { OrderStatus, OrderCategory, OrderSide, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CancelOrdersJob {
  private readonly logger = new Logger(CancelOrdersJob.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  async execute() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
        type: 'LIMIT',
        category: OrderCategory.DELIVERY,
      },
    });

    for (const order of orders) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED },
        });

        const unfilled = order.quantity - order.filledQty;
        if (unfilled <= 0) return;

        if (order.side === OrderSide.BUY && order.price) {
          const amt = new Prisma.Decimal(Number(order.price) * unfilled);
          await this.wallet.releaseFunds(order.userId, amt, tx);
        }

        if (order.side === OrderSide.SELL) {
          await tx.holding.updateMany({
            where: { userId: order.userId, stockId: order.stockId },
            data: { lockedQty: { decrement: unfilled } },
          });
        }
      });
    }

    this.logger.log(`Cancelled orders`);
  }
}