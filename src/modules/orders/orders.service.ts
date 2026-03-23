// src/modules/orders/orders.service.ts
import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService, MarketDepthInput } from './matching-engine.service';
import { OrderBookService } from './order-book.service';
import { DeliveryOrderStrategy } from './strategies/delivery-order.strategy';
import { IntradayOrderStrategy } from './strategies/intraday-order.strategy';
import { TradeSettlementService } from '../settlement/trade-settlement.service';
import { MarketDataService } from '../market/services/market-data.service';
import { OrderSide, OrderStatus, OrderType, OrderCategory } from '../../generated/prisma/client';
import { OrderStrategy } from './strategies/order-strategy.interface';

@Injectable()
export class OrdersService {
  private readonly strategyMap: Record<OrderCategory, OrderStrategy>;

  constructor(
    private readonly prisma:           PrismaService,
    private readonly matchingEngine:   MatchingEngineService,
    private readonly orderBook:        OrderBookService,
    private readonly deliveryStrategy: DeliveryOrderStrategy,
    private readonly intradayStrategy: IntradayOrderStrategy,
    private readonly tradeSettlement:  TradeSettlementService,
    private readonly marketData:       MarketDataService,
  ) {
    this.strategyMap = {
      [OrderCategory.DELIVERY]: this.deliveryStrategy,
      [OrderCategory.INTRADAY]: this.intradayStrategy,
    };
  }

  // ── Market hours: Mon–Fri 09:15–15:30 IST ────────────────────────────────
  private isMarketOpen(): boolean {
    const now  = new Date();
    const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const day  = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
  }

  async placeOrder(data: any) {
    const category = data.category ?? OrderCategory.DELIVERY;
    const strategy = this.strategyMap[category];

    // ── INTRADAY only allowed during market hours ─────────────────────────
    if (category === OrderCategory.INTRADAY && !this.isMarketOpen()) {
      throw new BadRequestException(
        'Intraday orders are only available Mon–Fri between 9:15 AM and 3:30 PM IST.'
      );
    }

    await strategy.validate(data);
    await strategy.prepareFunds(data);

    // ── MARKET orders: instant fill (only possible during market hours) ───
    // MARKET + DELIVERY during market hours → fill immediately
    // MARKET + DELIVERY outside market hours → treat as LIMIT at submitted price
    //   (rare edge case, handled by falling through to createAndMatchOrder)
    if (data.type === OrderType.MARKET && this.isMarketOpen()) {
      return this.executeMarketOrder(data, category);
    }

    // ── LIMIT orders (and MARKET outside hours): create OPEN, try to match ─
    // If market is open → attempt immediate fill via real Yahoo depth
    // If market is closed → order sits as OPEN, cron fills it at market open
    return this.createAndMatchOrder(data, category);
  }

  // ── MARKET: instant self-fill ─────────────────────────────────────────────
  private async executeMarketOrder(data: any, category: OrderCategory) {
    const price    = Number(data.price);
    const quantity = Number(data.quantity);

    const order = await this.prisma.order.create({
      data: {
        userId: data.userId, stockId: data.stockId,
        side: data.side, type: OrderType.MARKET, category,
        price, quantity,
        filledQty: quantity,
        status: OrderStatus.FILLED,
      },
      include: { stock: true },
    });

    await this.tradeSettlement.settleTrade({
      buyOrderId:  order.id,
      sellOrderId: order.id,
      buyerId:     data.side === OrderSide.BUY  ? data.userId : 'MARKET_BOOK',
      sellerId:    data.side === OrderSide.SELL ? data.userId : 'MARKET_BOOK',
      stockId:     data.stockId,
      price,
      quantity,
      category,
    });

    return order;
  }

  // ── LIMIT (or after-hours MARKET): create OPEN then try to match ──────────
  private async createAndMatchOrder(data: any, category: OrderCategory) {
    const order = await this.prisma.order.create({
      data: {
        userId: data.userId, stockId: data.stockId,
        side: data.side,
        // Store MARKET orders as LIMIT with submitted price when market is closed
        type:     data.type === OrderType.MARKET ? OrderType.LIMIT : data.type,
        category,
        price:    data.price,
        quantity: data.quantity,
        status:   OrderStatus.OPEN,
      },
      include: { stock: true },
    });

    // Only attempt immediate match if market is currently open
    if (this.isMarketOpen()) {
      const yahooSymbol = (order.stock as any).yahooSymbol
        ?? `${(order.stock as any).symbol}.NS`;
      const depth = await this.fetchDepth(yahooSymbol);
      if (depth) {
        await this.matchingEngine.processOrder(order.id, depth);
      }
    }
    // If market is closed: order stays OPEN
    // The cron (retryOpenLimitOrders) runs every 10s during market hours
    // and will fill it as soon as the market opens

    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { stock: true },
    });
  }

  // ── Build depth from live quote ───────────────────────────────────────────
  async fetchDepth(yahooSymbol: string): Promise<MarketDepthInput | null> {
    try {
      const quote = await this.marketData.fetchSingleQuote(yahooSymbol);
      if (!quote) return null;

      const mid  = quote.price;
      const tick = this.getTickSize(mid);

      const bids = Array.from({ length: 5 }, (_, i) => ({
        price:    parseFloat((mid - i * tick).toFixed(2)),
        quantity: Math.round(5000 * Math.max(0.3, 1 - i * 0.18)),
      }));
      const asks = Array.from({ length: 5 }, (_, i) => ({
        price:    parseFloat((mid + (i + 1) * tick).toFixed(2)),
        quantity: Math.round(5000 * Math.max(0.3, 1 - i * 0.18)),
      }));

      return { bids, asks };
    } catch {
      return null;
    }
  }

  private getTickSize(price: number): number {
    if (price < 10)   return 0.01;
    if (price < 25)   return 0.05;
    if (price < 100)  return 0.10;
    if (price < 500)  return 0.25;
    if (price < 1000) return 0.50;
    if (price < 2500) return 1.00;
    return 5.00;
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
      const cancelled   = await tx.order.update({
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
}