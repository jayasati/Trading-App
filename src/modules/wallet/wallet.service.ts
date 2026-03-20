import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  //deposit 
  async deposit(userId: string, amount: number) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid deposit amount');
    }

    return this.creditBalance(
      userId,
      new Prisma.Decimal(amount),
    );
  }

  //view wallet balance 
  async getWallet(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
    });
  }
  
  // 🔒 Lock funds when BUY LIMIT order is placed
  async lockFunds(userId: string,
     amount: Prisma.Decimal,
     tx:Prisma.TransactionClient=this.prisma,
    ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || wallet.balance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        lockedBalance: { increment: amount },
      },
    });
  }

  // ✅ Consume locked funds when trade executes
  async consumeLockedFunds(userId: string,
     amount: Prisma.Decimal,
     tx: Prisma.TransactionClient=this.prisma,
    ) {

    const wallet=await tx.wallet.findUnique({
      where:{userId},
    });
    if(!wallet ||wallet.lockedBalance.lt(amount)){
      throw new BadRequestException('InSufficient Locked Funds');
    }
    await tx.wallet.update({
      where: { userId },
      data: {
        lockedBalance: { decrement: amount },
      },
    });
  }

  // 💰 Credit seller after trade
  async creditBalance(userId: string, 
    amount: Prisma.Decimal,
    tx:Prisma.TransactionClient=this.prisma
  ) {
    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: amount },
      },
    });
  }

  // 🔓 Release unused locked funds (partial fill / cancel)
  async releaseFunds(userId: string, 
    amount: Prisma.Decimal,
    tx:Prisma.TransactionClient,
  ) {

    const wallet=await tx.wallet.findUnique({
      where:{userId},
    });

    if(!wallet || wallet.lockedBalance.lt(amount)){
      throw new BadRequestException("invalid locked balance");
    }

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: amount },
        lockedBalance: { decrement: amount },
      },
    });
  }
}
