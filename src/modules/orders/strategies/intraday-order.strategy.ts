// src/modules/orders/strategies/intraday-order.strategy.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { OrderSide, Prisma } from '../../../generated/prisma/client';
import { OrderStrategy } from './order-strategy.interface';
import { calculateIntradayMargin } from '../../../common/utils/intraday-margin';
import { PlaceOrderInput } from '../types/place-order-input.type';
import { ReleaseFundsOrder } from '../types/release-funds-order.type';

@Injectable()
export class IntradayOrderStrategy implements OrderStrategy {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  // ── validate ───────────────────────────────────────────────────────────────
  // Called BEFORE prepareFunds. For intraday SELL we pre-check balance here
  // so the error message is clear ("Insufficient balance") rather than a
  // cryptic DB error from lockFunds.
  async validate(data: PlaceOrderInput): Promise<void> {
    if (data.side !== OrderSide.SELL) return;

    // Check if selling to close an existing long (no margin needed for that part)
    const tradingDate  = this.getTradingDate();
    const existingPos  = await this.prisma.position.findUnique({
      where: {
        userId_stockId_tradingDate: {
          userId:  data.userId,
          stockId: data.stockId,
          tradingDate,
        },
      },
    });

    const netLongQty = existingPos
      ? Math.max(existingPos.buyQty - existingPos.sellQty, 0)
      : 0;

    // How many shares need short-sell margin
    const shortQty = Math.max(data.quantity - netLongQty, 0);

    if (shortQty > 0) {
      if (data.price == null) {
        throw new BadRequestException('Price is required for intraday short sell margin check');
      }
      // This sell (or part of it) is opening a short — check wallet
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: data.userId },
      });

      const required = new Prisma.Decimal(data.price).mul(shortQty).div(5);
      const available = wallet ? wallet.balance : new Prisma.Decimal(0);

      if (available.lt(required)) {
        throw new BadRequestException(
          `Insufficient balance for intraday short sell. ` +
          `Required margin: ₹${required.toFixed(2)}, ` +
          `Available: ₹${available.toFixed(2)}`
        );
      }
    }
  }

  // ── prepareFunds ───────────────────────────────────────────────────────────
  async prepareFunds(data: PlaceOrderInput, tx: any = this.prisma): Promise<void> {
    if (data.side === OrderSide.BUY) {
      if (data.price == null) {
        throw new BadRequestException('Price is required for intraday BUY orders');
      }

      // A BUY that covers an existing short must NOT lock new margin —
      // the short's collateral is already locked. Only the portion that
      // opens a new long needs 20% margin.
      const tradingDate = this.getTradingDate();
      const existingPos = await tx.position.findUnique({
        where: {
          userId_stockId_tradingDate: {
            userId:  data.userId,
            stockId: data.stockId,
            tradingDate,
          },
        },
      });

      const netShortQty = existingPos
        ? Math.max(existingPos.sellQty - existingPos.buyQty, 0)
        : 0;
      const coverQty    = Math.min(Number(data.quantity), netShortQty);
      const openLongQty = Number(data.quantity) - coverQty;

      if (openLongQty > 0) {
        const margin = calculateIntradayMargin(Number(data.price), openLongQty);
        await this.wallet.lockFunds(data.userId, margin, tx);
      }
      return;
    }

    // SELL — determine how much is closing a long vs opening a short
    const tradingDate  = this.getTradingDate();
    const existingPos  = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: {
          userId:  data.userId,
          stockId: data.stockId,
          tradingDate,
        },
      },
    });

    const netLongQty = existingPos
      ? Math.max(existingPos.buyQty - existingPos.sellQty, 0)
      : 0;

    // Closing existing longs: margin already locked at BUY time, nothing to do
    // Opening new shorts: lock 20% margin
    const shortQty = Math.max(data.quantity - netLongQty, 0);
    if (shortQty > 0) {
      if (data.price == null) {
        throw new BadRequestException('Price is required for intraday short sell orders');
      }
      const shortMargin = calculateIntradayMargin(Number(data.price), Number(shortQty));
      await this.wallet.lockFunds(data.userId, shortMargin, tx);
    }
  }

  // ── releaseFunds ───────────────────────────────────────────────────────────
  async releaseFunds(order: ReleaseFundsOrder, unfilledQty: number, tx: any): Promise<void> {
    if (unfilledQty <= 0) return;

    if (order.side === OrderSide.BUY) {
      if (order.price == null) {
        throw new BadRequestException('Cannot release intraday BUY margin without order price');
      }

      // Margin was only locked for the open-long portion at place time.
      // Re-derive coverQty from current position state to release the
      // matching portion of the unfilled qty.
      const tradingDate = this.getTradingDate();
      const existingPos = await tx.position.findUnique({
        where: {
          userId_stockId_tradingDate: {
            userId:  order.userId,
            stockId: order.stockId,
            tradingDate,
          },
        },
      });

      const netShortQty   = existingPos
        ? Math.max(existingPos.sellQty - existingPos.buyQty, 0)
        : 0;
      const coverUnfilled = Math.min(unfilledQty, netShortQty);
      const openLongUnfilled = unfilledQty - coverUnfilled;

      if (openLongUnfilled > 0) {
        const margin = calculateIntradayMargin(Number(order.price), openLongUnfilled);
        await this.wallet.releaseFunds(order.userId, margin, tx);
      }
      return;
    }

    // SELL cancel: release the short margin that was locked (if any)
    const tradingDate  = this.getTradingDate();
    const existingPos  = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: {
          userId:  order.userId,
          stockId: order.stockId,
          tradingDate,
        },
      },
    });

    const netLongQty = existingPos
      ? Math.max(existingPos.buyQty - existingPos.sellQty, 0)
      : 0;

    // For the unfilled qty, figure out what was short vs closing-long
    const closingQty = Math.min(unfilledQty, netLongQty);
    const shortQty   = unfilledQty - closingQty;

    if (shortQty > 0) {
      if (order.price == null) {
        throw new BadRequestException('Cannot release intraday short margin without order price');
      }
      const shortMargin = calculateIntradayMargin(Number(order.price), Number(shortQty));
      await this.wallet.releaseFunds(order.userId, shortMargin, tx);
    }
    // closingQty portion: the long's margin stays locked until the long actually fills/cancels
  }

  private getTradingDate(): Date {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
    );
  }
}