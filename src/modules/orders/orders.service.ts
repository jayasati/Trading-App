// src/modules/orders/orders.service.ts
import {
  Injectable, BadRequestException,
  NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { HoldingsService } from '../portfolio/holding.service';
import { WalletService } from '../wallet/wallet.service';
import { PositionsService } from '../positions/positions.service';
import {
  OrderSide, OrderStatus, OrderType,
  OrderCategory, Prisma,
} from '../../generated/prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma:           PrismaService,
    private readonly matchingEngine:   MatchingEngineService,
    private readonly orderBook:        OrderBookService,
    private readonly walletService:    WalletService,
    private readonly holdingsService:  HoldingsService,
    private readonly positionsService: PositionsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // placeOrder — entry point for all order placement
  // ─────────────────────────────────────────────────────────────────────────
  async placeOrder(data: any) {
    const category = data.category ?? OrderCategory.DELIVERY;

    if (category === OrderCategory.INTRADAY) {
      return this.placeIntradayOrder(data);
    }
    return this.placeDeliveryOrder(data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY order — locks funds / holdings, then matches
  // ─────────────────────────────────────────────────────────────────────────
  private async placeDeliveryOrder(data: any) {
    if (data.side === OrderSide.BUY) {
      const amountToLock = new Prisma.Decimal(data.price).mul(data.quantity);
      await this.walletService.lockFunds(data.userId, amountToLock);
    }

    if (data.side === OrderSide.SELL) {
      const holding = await this.prisma.holding.findUnique({
        where: {
          userId_stockId: { userId: data.userId, stockId: data.stockId },
        },
      });

      if (!holding) {
        throw new BadRequestException('No holdings found for this stock');
      }

      const available = holding.quantity - holding.lockedQty;
      if (available < data.quantity) {
        throw new BadRequestException(
          `Insufficient holdings. Available: ${available}, Requested: ${data.quantity}`
        );
      }

      await this.prisma.holding.update({
        where: { id: holding.id },
        data:  { lockedQty: { increment: data.quantity } },
      });
    }

    return this.createAndMatchOrder(data, OrderCategory.DELIVERY);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTRADAY order — 5x leverage for BUY, validate position for SELL
  //
  // FIX (Bug 4): Removed the premature position.quantity decrement for SELL.
  // The position is updated inside TradeSettlementService → addSell()
  // which runs inside the atomic $transaction AFTER the trade executes.
  // Decrementing here before matching means if no counterparty is found the
  // position qty would be wrong with no trade having happened.
  // ─────────────────────────────────────────────────────────────────────────
  private async placeIntradayOrder(data: any) {
    if (data.side === OrderSide.BUY) {
      // 5x leverage: lock only 20% of total order value
      const totalValue   = new Prisma.Decimal(data.price).mul(data.quantity);
      const marginAmount = totalValue.div(5);
      await this.walletService.lockFunds(data.userId, marginAmount);
    }

    if (data.side === OrderSide.SELL) {
      // Only validate — do NOT touch the position here.
      // The actual position update happens inside TradeSettlementService.settleTrade
      // → positions.addSell() which is wrapped in a $transaction.
      await this.positionsService.validateIntradaySell(
        data.userId,
        data.stockId,
        data.quantity,
      );
    }

    return this.createAndMatchOrder(data, OrderCategory.INTRADAY);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // createAndMatchOrder — shared order creation + matching
  // ─────────────────────────────────────────────────────────────────────────
  private async createAndMatchOrder(data: any, category: OrderCategory) {
    const order = await this.prisma.order.create({
      data: {
        userId:   data.userId,
        stockId:  data.stockId,
        side:     data.side,
        type:     data.type,
        category,
        price:    data.price,
        quantity: data.quantity,
        status:   OrderStatus.OPEN,
      },
      include: { stock: true },
    });

    this.orderBook.addOrder(order);
    await this.matchingEngine.processOrder(order.id);

    return order;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getUserOrders — all orders with optional filters
  // ─────────────────────────────────────────────────────────────────────────
  async getUserOrders(
    userId:   string,
    filters?: { status?: string; side?: string; category?: string },
  ) {
    const where: any = { userId };
    if (filters?.status)   where.status   = filters.status;
    if (filters?.side)     where.side     = filters.side;
    if (filters?.category) where.category = filters.category;

    return this.prisma.order.findMany({
      where,
      include: { stock: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // cancelOrder — cancel open/partial order + release locks
  // ─────────────────────────────────────────────────────────────────────────
  async cancelOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order)                  throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    if (
      order.status !== OrderStatus.OPEN &&
      order.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new BadRequestException(
        `Cannot cancel order with status: ${order.status}`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data:  { status: OrderStatus.CANCELLED },
      });

      const unfilledQty = order.quantity - order.filledQty;

      // Release locked funds for BUY orders
      if (order.side === OrderSide.BUY && order.price && unfilledQty > 0) {
        const totalValue   = new Prisma.Decimal(Number(order.price) * unfilledQty);
        const amountToFree = order.category === OrderCategory.INTRADAY
          ? totalValue.div(5)  // 5x leverage: only 20% was locked
          : totalValue;        // delivery: full amount was locked
        await this.walletService.releaseFunds(userId, amountToFree, tx);
      }

      // Release locked holdings for DELIVERY SELL orders
      if (
        order.side === OrderSide.SELL &&
        order.category === OrderCategory.DELIVERY &&
        unfilledQty > 0
      ) {
        const holding = await tx.holding.findUnique({
          where: { userId_stockId: { userId, stockId: order.stockId } },
        });
        if (holding) {
          await tx.holding.update({
            where: { id: holding.id },
            data:  { lockedQty: { decrement: unfilledQty } },
          });
        }
      }

      // For INTRADAY SELL cancellations: nothing to undo here since we no longer
      // decrement the position at order placement time. The position qty is only
      // ever touched inside the $transaction when a trade actually settles.

      this.orderBook.removeorder(order.stockId, orderId, order.side);
      return cancelled;
    });
  }
}