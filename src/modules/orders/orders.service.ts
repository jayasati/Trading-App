import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { HoldingsService } from '../portfolio/holding.service';
import { WalletService } from '../wallet/wallet.service';
import {
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '../../generated/prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma:         PrismaService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly orderBook:      OrderBookService,
    private readonly walletService:  WalletService,
    private readonly holdingsService:HoldingsService,
  ) {}

  // ─── Place a new order ───
  async placeOrder(data: any) {
    // BUY → lock funds
    if (data.side === OrderSide.BUY) {
      if (data.type !== OrderType.LIMIT && data.type !== OrderType.MARKET) {
        throw new BadRequestException('Only LIMIT and MARKET orders supported');
      }

      const amountToLock = new Prisma.Decimal(data.price).mul(data.quantity);
      await this.walletService.lockFunds(data.userId, amountToLock);
    }

    // SELL → validate + lock holdings
    if (data.side === OrderSide.SELL) {
      const holding = await this.prisma.holding.findUnique({
        where: {
          userId_stockId: { userId: data.userId, stockId: data.stockId },
        },
      });

      if (!holding) throw new BadRequestException('No holdings found for this stock');

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

    // Create order in DB
    const order = await this.prisma.order.create({
      data: {
        userId:   data.userId,
        stockId:  data.stockId,
        side:     data.side,
        type:     data.type,
        price:    data.price,
        quantity: data.quantity,
        status:   OrderStatus.OPEN,
      },
      include: { stock: true },
    });

    // Add to in-memory order book
    this.orderBook.addOrder(order);

    // Trigger matching engine
    await this.matchingEngine.processOrder(order.id);

    return order;
  }

  // ─── Get all orders for a user ───
  async getUserOrders(
    userId: string,
    filters?: { status?: string; side?: string },
  ) {
    const where: any = { userId };

    if (filters?.status) where.status = filters.status;
    if (filters?.side)   where.side   = filters.side;

    return this.prisma.order.findMany({
      where,
      include: { stock: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Cancel an open order ───
  async cancelOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.PARTIALLY_FILLED) {
      throw new BadRequestException(`Cannot cancel an order with status: ${order.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Mark order cancelled
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data:  { status: OrderStatus.CANCELLED },
      });

      // Release locked funds if it was a BUY order
      if (order.side === OrderSide.BUY && order.price) {
        const unfilledQty   = order.quantity - order.filledQty;
        const amountToFree  = new Prisma.Decimal(Number(order.price) * unfilledQty);
        await this.walletService.releaseFunds(userId, amountToFree, tx);
      }

      // Release locked shares if it was a SELL order
      if (order.side === OrderSide.SELL) {
        const unfilledQty = order.quantity - order.filledQty;
        const holding = await tx.holding.findUnique({
          where: { userId_stockId: { userId, stockId: order.stockId } },
        });
        if (holding && unfilledQty > 0) {
          await tx.holding.update({
            where: { id: holding.id },
            data:  { lockedQty: { decrement: unfilledQty } },
          });
        }
      }

      // Remove from in-memory order book
      this.orderBook.removeorder(order.stockId, orderId, order.side);

      return cancelled;
    });
  }
}