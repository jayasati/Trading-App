import { Injectable } from '@nestjs/common';
import { WalletService } from '../../wallet/wallet.service';
import { PositionsService } from '../../positions/positions.service';
import { OrderSide, Prisma } from '../../../generated/prisma/client';
import { OrderStrategy } from './order-strategy.interface';

@Injectable()
export class IntradayOrderStrategy implements OrderStrategy {
  constructor(
    private readonly wallet:    WalletService,
    private readonly positions: PositionsService,
  ) {}

  async validate(data: any): Promise<void> {
    if (data.side !== OrderSide.SELL) return;
    await this.positions.validateIntradaySell(data.userId, data.stockId, data.quantity);
  }

  async prepareFunds(data: any): Promise<void> {
    if (data.side === OrderSide.BUY) {
      // 5× leverage: lock only 20% margin
      const margin = new Prisma.Decimal(data.price).mul(data.quantity).div(5);
      await this.wallet.lockFunds(data.userId, margin);
    }
    // SELL: no fund prep — settlement handles position update atomically
  }

  async releaseFunds(order: any, unfilledQty: number, tx: any): Promise<void> {
    if (order.side === OrderSide.BUY && order.price && unfilledQty > 0) {
      const margin = new Prisma.Decimal(Number(order.price) * unfilledQty).div(5);
      await this.wallet.releaseFunds(order.userId, margin, tx);
    }
    // SELL intraday cancel: nothing to undo — position was never touched at order time
  }
}