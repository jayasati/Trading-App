
import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
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
import { isMarketOpen } from '../../common/utils/market-hours';
import { PlaceOrderInput } from './types/place-order-input.type';

@Injectable()
export class OrdersService {
  private readonly strategyMap: Record<OrderCategory, OrderStrategy>;
  private readonly logger = new Logger(OrdersService.name);

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

  async placeOrder(data: PlaceOrderInput) {
    const normalized = this.normalizeInput(data);
    const category = normalized.category ?? OrderCategory.DELIVERY;
    const strategy = this.strategyMap[category];

    // Intraday only allowed during market hours
    if (category === OrderCategory.INTRADAY && !isMarketOpen()) {
      throw new BadRequestException(
        'Intraday orders are only available Mon–Fri between 9:15 AM and 3:30 PM IST.'
      );
    }

    // MARKET orders must NOT trust client-supplied price. We derive the execution
    // price from live market data and then validate/lock funds using that price.
    const pricedData =
      normalized.type === OrderType.MARKET && isMarketOpen()
        ? await this.withServerMarketPrice(normalized)
        : normalized;

    if (pricedData.price == null) {
      throw new BadRequestException(
        'Price is required for LIMIT/STOP_LOSS and after-hours MARKET orders.',
      );
    }

    // Always validate first (checks holdings for delivery sell, etc.)
    await strategy.validate(pricedData);

    if (pricedData.type === OrderType.MARKET && isMarketOpen()) {
      return this.executeMarketOrder(pricedData, category, strategy);
    }

    return this.createAndMatchOrder(pricedData, category, strategy);
  }

  // ── MARKET: instant self-fill ──────────────────────────────────────────────
  // prepareFunds has ALREADY been called by placeOrder before this runs.
  // Do NOT call prepareFunds again here.
  private async executeMarketOrder(
    data: PlaceOrderInput,
    category: OrderCategory,
    strategy: OrderStrategy,
  ) {
    const price    = Number(data.price);
    const quantity = Number(data.quantity);

    return await this.prisma.$transaction(async (tx) => {
      await strategy.prepareFunds(data, tx);

      const order = await tx.order.create({
        data: {
          userId:    data.userId,
          stockId:   data.stockId,
          side:      data.side,
          type:      OrderType.MARKET,
          category,
          price,
          quantity,
          filledQty: quantity,
          status:    OrderStatus.FILLED,
        },
        include: { stock: true },
      });

      await this.tradeSettlement.settleTradeInTx(tx, {
        buyOrderId:  data.side === OrderSide.BUY  ? order.id : 'MARKET_BOOK',
        sellOrderId: data.side === OrderSide.SELL ? order.id : 'MARKET_BOOK',
        buyerId:     data.side === OrderSide.BUY  ? data.userId : 'MARKET_BOOK',
        sellerId:    data.side === OrderSide.SELL ? data.userId : 'MARKET_BOOK',
        stockId:     data.stockId,
        price,
        quantity,
        category,
      });

      return order;
    });
  }

  private async withServerMarketPrice(data: PlaceOrderInput): Promise<PlaceOrderInput> {
    const stock = await this.prisma.stock.findUnique({
      where: { id: data.stockId },
      select: { yahooSymbol: true, symbol: true },
    });

    if (!stock) throw new NotFoundException('Stock not found');

    const yahooSymbol = stock.yahooSymbol ?? `${stock.symbol}.NS`;
    const quote = await this.marketData.fetchSingleQuote(yahooSymbol);
    if (!quote || typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) {
      throw new BadRequestException('Unable to fetch live price for MARKET order');
    }

    return { ...data, price: quote.price };
  }

  // ── LIMIT (or after-hours MARKET): create OPEN then try to match ───────────
  // prepareFunds has ALREADY been called by placeOrder before this runs.
  private async createAndMatchOrder(
    data: PlaceOrderInput,
    category: OrderCategory,
    strategy: OrderStrategy,
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      await strategy.prepareFunds(data, tx);

      return tx.order.create({
        data: {
          userId:   data.userId,
          stockId:  data.stockId,
          side:     data.side,
          type:     data.type === OrderType.MARKET ? OrderType.LIMIT : data.type,
          category,
          price:    data.price,
          quantity: data.quantity,
          status:   OrderStatus.OPEN,
        },
        include: { stock: true },
      });
    });

    if (isMarketOpen()) {
      const yahooSymbol = order.stock.yahooSymbol ?? `${order.stock.symbol}.NS`;
      const depth = await this.fetchDepth(yahooSymbol);
      if (depth) {
        await this.matchingEngine.processOrder(order.id, depth);
      }
    }

    return this.prisma.order.findUnique({
      where:   { id: order.id },
      include: { stock: true },
    });
  }

  // ── Build depth from live quote ────────────────────────────────────────────
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
    return this.prisma.$transaction(async (tx) => {
      
      //  Fetch inside transaction
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });
  
      if (!order) {
        throw new NotFoundException('Order not found');
      }
  
      if (order.userId !== userId) {
        throw new ForbiddenException('Not your order');
      }
  
      if (
        order.status !== OrderStatus.OPEN &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      ) {
        throw new BadRequestException(
          `Cannot cancel order with status: ${order.status}`
        );
      }
  
      //  Calculate unfilled quantity INSIDE TX
      const unfilledQty = order.quantity - order.filledQty;
  
      // Atomic update with condition (extra safety)
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: {
            in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED],
          },
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
  
      //  If no rows updated → race condition detected
      if (updated.count === 0) {
        throw new BadRequestException(
          'Order was already updated by another process'
        );
      }
  
      const strategy = this.strategyMap[order.category];
  
      await strategy.releaseFunds(order, unfilledQty, tx);
  
      try {
        this.orderBook.removeorder(order.stockId, orderId, order.side);
      } catch (error) {
        this.logger.warn(
          `OrderBook remove failed for orderId=${orderId}: ${(error as Error).message}`
        );
      }
  
      return {
        ...order,
        status: OrderStatus.CANCELLED,
      };
    });
  }
  private normalizeInput(data: PlaceOrderInput): PlaceOrderInput {
    return {
      ...data,
      price: data.price == null ? undefined : Number(data.price),
      quantity: Number(data.quantity),
    };
  }
}