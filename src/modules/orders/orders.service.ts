import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { DeliveryOrderStrategy } from './strategies/delivery-order.strategy';
import { IntradayOrderStrategy } from './strategies/intraday-order.strategy';
import { OrderSide, OrderStatus, OrderCategory } from '../../generated/prisma/client';
import { OrderStrategy } from './strategies/order-strategy.interface';

@Injectable()
export class OrdersService {
  private readonly strategyMap: Record<OrderCategory, OrderStrategy>;

  constructor(
    private readonly prisma:          PrismaService,
    private readonly matchingEngine:  MatchingEngineService,
    private readonly orderBook:       OrderBookService,
    private readonly deliveryStrategy: DeliveryOrderStrategy,
    private readonly intradayStrategy: IntradayOrderStrategy,
  ) {
    // Register strategies once — adding a new order type = add a new strategy class
    this.strategyMap = {
      [OrderCategory.DELIVERY]: this.deliveryStrategy,
      [OrderCategory.INTRADAY]: this.intradayStrategy,
    };
  }

  async placeOrder(data: any) {
    const category = data.category ?? OrderCategory.DELIVERY;
    const strategy = this.strategyMap[category];

    await strategy.validate(data);
    await strategy.prepareFunds(data);
    return this.createAndMatchOrder(data, category);
  }

  async getUserOrders(userId: string, filters?: { status?: string; side?: string }) {
    const where: any = { userId };
    if (filters?.status) where.status = filters.status;
    if (filters?.side)   where.side   = filters.side;

    return this.prisma.order.findMany({
      where,
      include: { stock: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order)                  throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.PARTIALLY_FILLED) {
      throw new BadRequestException(`Cannot cancel order with status: ${order.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled  = await tx.order.update({
        where: { id: orderId },
        data:  { status: OrderStatus.CANCELLED },
      });
      const unfilledQty = order.quantity - order.filledQty;
      const strategy    = this.strategyMap[order.category];
      await strategy.releaseFunds(order, unfilledQty, tx);
      this.orderBook.removeorder(order.stockId, orderId, order.side);
      return cancelled;
    });
  }

  private async createAndMatchOrder(data: any, category: OrderCategory) {
    const order = await this.prisma.order.create({
      data: {
        userId: data.userId, stockId: data.stockId,
        side: data.side, type: data.type, category,
        price: data.price, quantity: data.quantity,
        status: OrderStatus.OPEN,
      },
      include: { stock: true },
    });

    this.orderBook.addOrder(order);
    await this.matchingEngine.processOrder(order.id);
    return order;
  }
}