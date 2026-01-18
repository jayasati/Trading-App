import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderBookService } from './order-book.service';
import {
  OrderSide,
  OrderStatus,
} from '../../generated/prisma/client';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class MatchingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderBook: OrderBookService,
    private readonly walletService: WalletService,
  ) {}

  async processOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== OrderStatus.OPEN) {
      return;
    }

    const book = this.orderBook.getBook(order.stockId);

    if (order.side === OrderSide.BUY) {
      await this.matchBuy(order, book.sell);
    } else {
      await this.matchSell(order, book.buy);
    }
  }

  // ---------------- BUY MATCHING ----------------

  private async matchBuy(order, sellBook) {
    // Lowest sell price first, then time
    sellBook.sort(
      (a, b) =>
        a.price - b.price ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (const sell of sellBook) {
      if (order.filledQty >= order.quantity) break;
      if (order.price !== null && sell.price > order.price) break;
      if (sell.remainingQty <= 0) continue;

      const remainingBuyQty =
        order.quantity - order.filledQty;

      const tradeQty = Math.min(
        remainingBuyQty,
        sell.remainingQty,
      );

      await this.executeTrade(
        order.id,
        sell.orderId,
        order.stockId,
        tradeQty,
        sell.price,
      );

      sell.remainingQty -= tradeQty;
    }
  }

  // ---------------- SELL MATCHING ----------------

  private async matchSell(order, buyBook) {
    // Highest buy price first, then time
    buyBook.sort(
      (a, b) =>
        b.price - a.price ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (const buy of buyBook) {
      if (order.filledQty >= order.quantity) break;
      if (order.price !== null && buy.price < order.price) break;
      if (buy.remainingQty <= 0) continue;

      const remainingSellQty =
        order.quantity - order.filledQty;

      const tradeQty = Math.min(
        remainingSellQty,
        buy.remainingQty,
      );

      await this.executeTrade(
        buy.orderId,
        order.id,
        order.stockId,
        tradeQty,
        buy.price,
      );

      buy.remainingQty -= tradeQty;
    }
  }

  // ---------------- TRADE EXECUTION ----------------

  private async executeTrade(
    buyOrderId: string,
    sellOrderId: string,
    stockId: string,
    quantity: number,
    price: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const buyOrder = await tx.order.findUnique({
        where: { id: buyOrderId },
      });

      const sellOrder = await tx.order.findUnique({
        where: { id: sellOrderId },
      });

      if (!buyOrder || !sellOrder) return;

      // 1️ Create trade
      await tx.trade.create({
        data: {
          buyOrderId,
          sellOrderId,
          stockId,
          quantity,
          price,
        },
      });

      // 2️ Update BUY order
      const newBuyFilled =
        buyOrder.filledQty + quantity;

      await tx.order.update({
        where: { id: buyOrderId },
        data: {
          filledQty: newBuyFilled,
          status:
            newBuyFilled >= buyOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      });

      // 3️  Update SELL order
      const newSellFilled =
        sellOrder.filledQty + quantity;

      await tx.order.update({
        where: { id: sellOrderId },
        data: {
          filledQty: newSellFilled,
          status:
            newSellFilled >= sellOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      });

      // 4️ Release BUY locked funds (executed value)
      await this.walletService.releaseFunds(
        buyOrder.userId,
        quantity * price,
      );
    });
  }
}
