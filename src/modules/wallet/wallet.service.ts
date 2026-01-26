import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  // 🔒 Lock funds when BUY LIMIT order is placed
  async lockFunds(userId: string, amount: Prisma.Decimal) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || wallet.balance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        lockedBalance: { increment: amount },
      },
    });
  }

  // ✅ Consume locked funds when trade executes
  async consumeLockedFunds(userId: string, amount: Prisma.Decimal) {
    await this.prisma.wallet.update({
      where: { userId },
      data: {
        lockedBalance: { decrement: amount },
      },
    });
  }

  // 💰 Credit seller after trade
  async creditBalance(userId: string, amount: Prisma.Decimal) {
    await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: { increment: amount },
      },
    });
  }

  // 🔓 Release unused locked funds (partial fill / cancel)
  async releaseFunds(userId: string, amount: Prisma.Decimal) {
    await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: { increment: amount },
        lockedBalance: { decrement: amount },
      },
    });
  }
}
