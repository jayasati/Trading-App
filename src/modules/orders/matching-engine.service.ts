import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderBookService } from './order-book.service';
import {
  OrderSide,
  OrderStatus,
  Prisma,
  Order,
} from '../../generated/prisma/client';

import { WalletService } from '../wallet/wallet.service';

interface MatchConfig {
  incomingOrder: Order;
  matchingOrders: Order[];
  getTradePrice: (incoming: Order, matching: Order) => number;
  shouldMatch: (incoming: Order, matching: Order) => boolean;
  getBuyer: (incoming: Order, matching: Order) => { id: string; userId: string };
  getSeller: (incoming: Order, matching: Order) => { id: string; userId: string };
}

@Injectable()
export class MatchingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderBookService: OrderBookService,
    private readonly walletService: WalletService,
  ) { }

  async processOrder(orderId: string) {
    const incomingOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!incomingOrder || incomingOrder.status !== OrderStatus.OPEN) return;

    const book = this.orderBookService.getBook(incomingOrder.stockId);

    if (incomingOrder.side === OrderSide.BUY) {
      await this.match({
        incomingOrder,
        matchingOrders: book.getSellOrders(),
        getTradePrice: (_, sell) => Number(sell.price),
        shouldMatch: (buy, sell) =>
          !!buy.price && !!sell.price && buy.price >= sell.price,
        getBuyer: (buy, _) => ({ id: buy.id, userId: buy.userId }),
        getSeller: (_, sell) => ({ id: sell.id, userId: sell.userId }),
      });
    } else {
      await this.match({
        incomingOrder,
        matchingOrders: book.getBuyOrders(),
        getTradePrice: (_, buy) => Number(buy.price),
        shouldMatch: (sell, buy) =>
          !!sell.price && !!buy.price && buy.price >= sell.price,
        getBuyer: (_, buy) => ({ id: buy.id, userId: buy.userId }),
        getSeller: (sell, _) => ({ id: sell.id, userId: sell.userId }),
      });
    }
  }

  // ======================= UNIFIED MATCHING LOGIC =======================

  private async match(config: MatchConfig) {
    let { incomingOrder } = config;
    const { matchingOrders, getTradePrice, shouldMatch, getBuyer, getSeller } = config;

    for (const matchingOrder of matchingOrders) {
      const remainingIncoming = incomingOrder.quantity - incomingOrder.filledQty;
      if (remainingIncoming <= 0) break;

      // Price condition check
      if (!shouldMatch(incomingOrder, matchingOrder)) {
        // For BUY orders, break if no match (sorted by price)
        // For SELL orders, continue checking (buyers have different prices)
        if (incomingOrder.side === OrderSide.BUY) break;
        continue;
      }

      const remainingMatching = matchingOrder.quantity - matchingOrder.filledQty;
      if (remainingMatching <= 0) continue;

      const matchQty = Math.min(remainingIncoming, remainingMatching);
      const tradePrice = getTradePrice(incomingOrder, matchingOrder);
      const tradeValue = new Prisma.Decimal(matchQty).mul(tradePrice);

      const buyer = getBuyer(incomingOrder, matchingOrder);
      const seller = getSeller(incomingOrder, matchingOrder);

      // 🟢 Update both orders
      const [updatedIncoming, updatedMatching] = await Promise.all([
        this.prisma.order.update({
          where: { id: incomingOrder.id },
          data: { filledQty: { increment: matchQty } },
        }),
        this.prisma.order.update({
          where: { id: matchingOrder.id },
          data: { filledQty: { increment: matchQty } },
        }),
      ]);

      // 🟢 Create trade record
      await this.prisma.trade.create({
        data: {
          buyOrderId: buyer.id,
          sellOrderId: seller.id,
          stockId: incomingOrder.stockId,
          price: new Prisma.Decimal(tradePrice),
          quantity: matchQty,
        },
      });

      // 🟢 Wallet settlement
      await Promise.all([
        this.walletService.consumeLockedFunds(buyer.userId, tradeValue),
        this.walletService.creditBalance(seller.userId, tradeValue),
      ]);

      // 🟢 Finalize matching order if fully filled
      if (updatedMatching.filledQty === updatedMatching.quantity) {
        await this.prisma.order.update({
          where: { id: matchingOrder.id },
          data: { status: OrderStatus.FILLED },
        });
      }

      incomingOrder = updatedIncoming;
    }

    // 🟢 Finalize incoming order
    const newStatus = this.determineOrderStatus(
      incomingOrder.filledQty,
      incomingOrder.quantity
    );

    if (newStatus !== OrderStatus.OPEN) {
      await this.prisma.order.update({
        where: { id: incomingOrder.id },
        data: { status: newStatus },
      });
    }
  }

  private determineOrderStatus(filledQty: number, totalQty: number): OrderStatus {
    if (filledQty === 0) return OrderStatus.OPEN;
    if (filledQty >= totalQty) return OrderStatus.FILLED;
    return OrderStatus.PARTIALLY_FILLED;
  }
}