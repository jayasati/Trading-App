import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { OrderSide, Prisma } from '../../../generated/prisma/client';
import { OrderStrategy } from './order-strategy.interface';

@Injectable()
export class DeliveryOrderStrategy implements OrderStrategy {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly wallet:  WalletService,
  ) {}

  async validate(data: any): Promise<void> {
    if (data.side !== OrderSide.SELL) return;

    const holding = await this.prisma.holding.findUnique({
      where: { userId_stockId: { userId: data.userId, stockId: data.stockId } },
    });

    if (!holding) throw new BadRequestException('No holdings found for this stock');

    const available = holding.quantity - holding.lockedQty;
    if (available < data.quantity) {
      throw new BadRequestException(
        `Insufficient holdings. Available: ${available}, Requested: ${data.quantity}`,
      );
    }
  }

  async prepareFunds(data: any): Promise<void> {
    if (data.side === OrderSide.BUY) {
      await this.wallet.lockFunds(data.userId, new Prisma.Decimal(data.price).mul(data.quantity));
    } else {
      // Lock holdings so they can't be double-sold
      await this.prisma.holding.update({
        where: { userId_stockId: { userId: data.userId, stockId: data.stockId } },
        data:  { lockedQty: { increment: data.quantity } },
      });
    }
  }

  async releaseFunds(order: any, unfilledQty: number, tx: any): Promise<void> {
    if (order.side === OrderSide.BUY && order.price && unfilledQty > 0) {
      const amount = new Prisma.Decimal(Number(order.price) * unfilledQty);
      await this.wallet.releaseFunds(order.userId, amount, tx);
    }
    if (order.side === OrderSide.SELL && unfilledQty > 0) {
      const holding = await tx.holding.findUnique({
        where: { userId_stockId: { userId: order.userId, stockId: order.stockId } },
      });
      if (holding) {
        await tx.holding.update({
          where: { id: holding.id },
          data:  { lockedQty: { decrement: unfilledQty } },
        });
      }
    }
  }
}