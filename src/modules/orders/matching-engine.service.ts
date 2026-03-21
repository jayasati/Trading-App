// src/modules/orders/matching-engine.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderBookService } from './order-book.service';
import {
  OrderSide, OrderStatus, OrderCategory,
  Prisma, Order,
} from '../../generated/prisma/client';
import { WalletService } from '../wallet/wallet.service';
import { TradeSettlementService } from '../market/trade-settlement.service';

interface MatchConfig {
  incomingOrder:  Order;
  matchingOrders: Order[];
  getTradePrice:  (incoming: Order, matching: Order) => number;
  shouldMatch:    (incoming: Order, matching: Order) => boolean;
  getBuyer:       (incoming: Order, matching: Order) => { id: string; userId: string };
  getSeller:      (incoming: Order, matching: Order) => { id: string; userId: string };
}

@Injectable()
export class MatchingEngineService {
  constructor(
    private readonly prisma:             PrismaService,
    private readonly orderBookService:   OrderBookService,
    private readonly walletService:      WalletService,
    private readonly tradeSettlement:    TradeSettlementService,
  ) {}

  async processOrder(orderId: string) {
    const incomingOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!incomingOrder || incomingOrder.status !== OrderStatus.OPEN) return;

    // Only match orders of the same category (delivery vs intraday)
    const openOrders = await this.prisma.order.findMany({
      where: {
        stockId:  incomingOrder.stockId,
        status:   OrderStatus.OPEN,
        category: incomingOrder.category, // ← match same category only
      },
      orderBy: { createdAt: 'asc' },
    });

    const book = this.orderBookService.getBook(incomingOrder.stockId);
    book.clear();
    for (const order of openOrders) {
      this.orderBookService.addOrder(order);
    }

    if (incomingOrder.side === OrderSide.BUY) {
      await this.match({
        incomingOrder,
        matchingOrders: book.getSellOrders(),
        getTradePrice:  (_, sell) => Number(sell.price),
        shouldMatch:    (buy, sell) =>
          !!buy.price && !!sell.price && buy.price >= sell.price,
        getBuyer:  (buy, _)  => ({ id: buy.id,  userId: buy.userId }),
        getSeller: (_, sell) => ({ id: sell.id, userId: sell.userId }),
      });
    } else {
      await this.match({
        incomingOrder,
        matchingOrders: book.getBuyOrders(),
        getTradePrice:  (_, buy) => Number(buy.price),
        shouldMatch:    (sell, buy) =>
          !!sell.price && !!buy.price && buy.price >= sell.price,
        getBuyer:  (_, buy)  => ({ id: buy.id,  userId: buy.userId }),
        getSeller: (sell, _) => ({ id: sell.id, userId: sell.userId }),
      });
    }
  }

  private async match(config: MatchConfig) {
    let { incomingOrder } = config;
    const {
      matchingOrders, getTradePrice,
      shouldMatch, getBuyer, getSeller,
    } = config;

    for (const matchingOrder of matchingOrders) {
      const remainingIncoming = incomingOrder.quantity - incomingOrder.filledQty;
      if (remainingIncoming <= 0) break;

      if (!shouldMatch(incomingOrder, matchingOrder)) {
        if (incomingOrder.side === OrderSide.BUY) break;
        continue;
      }

      const remainingMatching = matchingOrder.quantity - matchingOrder.filledQty;
      if (remainingMatching <= 0) continue;

      const matchQty   = Math.min(remainingIncoming, remainingMatching);
      const tradePrice = getTradePrice(incomingOrder, matchingOrder);
      const buyer      = getBuyer(incomingOrder, matchingOrder);
      const seller     = getSeller(incomingOrder, matchingOrder);

      const [updatedIncoming, updatedMatching] = await Promise.all([
        this.prisma.order.update({
          where: { id: incomingOrder.id },
          data:  { filledQty: { increment: matchQty } },
        }),
        this.prisma.order.update({
          where: { id: matchingOrder.id },
          data:  { filledQty: { increment: matchQty } },
        }),
      ]);

      // ← Pass category so settlement knows delivery vs intraday
      await this.tradeSettlement.settleTrade({
        buyOrderId:  buyer.id,
        sellOrderId: seller.id,
        buyerId:     buyer.userId,
        sellerId:    seller.userId,
        stockId:     incomingOrder.stockId,
        price:       tradePrice,
        quantity:    matchQty,
        category:    incomingOrder.category, // ← NEW
      });

      if (updatedMatching.filledQty >= updatedMatching.quantity) {
        await this.prisma.order.update({
          where: { id: matchingOrder.id },
          data:  { status: OrderStatus.FILLED },
        });
        this.orderBookService.removeorder(
          matchingOrder.stockId,
          matchingOrder.id,
          matchingOrder.side,
        );
      }

      incomingOrder = updatedIncoming;
    }

    const newStatus = this.determineStatus(
      incomingOrder.filledQty,
      incomingOrder.quantity,
    );

    if (newStatus !== OrderStatus.OPEN) {
      await this.prisma.order.update({
        where: { id: incomingOrder.id },
        data:  { status: newStatus },
      });
      if (newStatus === OrderStatus.FILLED) {
        this.orderBookService.removeorder(
          incomingOrder.stockId,
          incomingOrder.id,
          incomingOrder.side,
        );
      }
    }
  }

  private determineStatus(filledQty: number, totalQty: number): OrderStatus {
    if (filledQty === 0)         return OrderStatus.OPEN;
    if (filledQty >= totalQty)   return OrderStatus.FILLED;
    return OrderStatus.PARTIALLY_FILLED;
  }
}