import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lock funds for BUY orders
   */
  async lockFunds(userId: string, amount: Prisma.Decimal) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || wallet.balance.lessThan(amount) ) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: new Prisma.Decimal(amount) },
        lockedBalance: { increment: new Prisma.Decimal(amount) },
      },
    });
  }

  /**
   * Release unused locked funds (cancel / unfilled)
   */
  async releaseFunds(userId: string, amount: number) {
    await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: { increment: new Prisma.Decimal(amount) },
        lockedBalance: { decrement: new Prisma.Decimal(amount) },
      },
    });
  }

  /**
   * Settle executed trade
   */
  async settleTrade(
    buyerId: string,
    sellerId: string,
    amount: number,
  ) {
    await this.prisma.$transaction([
      // buyer: remove locked funds
      this.prisma.wallet.update({
        where: { userId: buyerId },
        data: {
          lockedBalance: { decrement: new Prisma.Decimal(amount) },
        },
      }),

      // seller: receive money
      this.prisma.wallet.update({
        where: { userId: sellerId },
        data: {
          balance: { increment: new Prisma.Decimal(amount) },
        },
      }),
    ]);
  }
}
