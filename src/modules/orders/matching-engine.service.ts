import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderBookService } from './order-book.service';
import { OrderSide, OrderStatus } from '../../generated/prisma/client';

@Injectable()
export class MatchingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderBook: OrderBookService,
  ) {}

  async processOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { stock: true },
    });

    if (!order || order.status !== OrderStatus.OPEN) return;

    // Fetch actual orders from database for matching
    if (order.side === OrderSide.BUY) {
      await this.matchBuy(order);
    } else {
      await this.matchSell(order);
    }
  }

  private async matchBuy(order) {
    // Fetch all open SELL orders for this stock from database
    const sellOrders = await this.prisma.order.findMany({
      where: {
        stockId: order.stockId,
        side: OrderSide.SELL,
        status: {
          in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED],
        },
      },
      orderBy: {
        price: 'asc', // Buy at lowest price
      },
    });

    for (const sell of sellOrders) {
      if (order.filledQty >= order.quantity) break;
      
      // Skip if sell order has no price (shouldn't happen for limit orders)
      if (!sell.price) continue;
      
      // Skip if buy order has price limit and sell price exceeds it
      if (order.price && sell.price > order.price) break;

      const qty = Math.min(
        order.quantity - order.filledQty,
        sell.quantity - sell.filledQty,
      );

      // executeTrade(buyOrder, sellOrder, qty, price)
      // The incoming order is BUY, matching against SELL
      await this.executeTrade(order, sell, qty, sell.price.toNumber());
      
      // Refresh the order to get updated filledQty
      const updatedOrder = await this.prisma.order.findUnique({
        where: { id: order.id },
      });
      if (updatedOrder) {
        order.filledQty = updatedOrder.filledQty;
      }
    }
  }

  private async matchSell(order) {
    // Fetch all open BUY orders for this stock from database
    const buyOrders = await this.prisma.order.findMany({
      where: {
        stockId: order.stockId,
        side: OrderSide.BUY,
        status: {
          in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED],
        },
      },
      orderBy: {
        price: 'desc', // Sell at highest price
      },
    });

    for (const buy of buyOrders) {
      if (order.filledQty >= order.quantity) break;
      
      // Skip if buy order has no price (shouldn't happen for limit orders)
      if (!buy.price) continue;
      
      // Skip if sell order has price limit and buy price is below it
      if (order.price && buy.price < order.price) break;

      const qty = Math.min(
        order.quantity - order.filledQty,
        buy.quantity - buy.filledQty,
      );

      // executeTrade(buyOrder, sellOrder, qty, price)
      // The incoming order is SELL, matching against BUY
      await this.executeTrade(buy, order, qty, buy.price.toNumber());
      
      // Refresh the order to get updated filledQty
      const updatedOrder = await this.prisma.order.findUnique({
        where: { id: order.id },
      });
      if (updatedOrder) {
        order.filledQty = updatedOrder.filledQty;
      }
    }
  }

  private async executeTrade(
    buyOrder,
    sellOrder,
    quantity: number,
    price: number,
  ) {
    await this.prisma.$transaction([
      this.prisma.trade.create({
        data: {
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          stockId: buyOrder.stockId,
          price,
          quantity,
        },
      }),

      this.prisma.order.update({
        where: { id: buyOrder.id },
        data: {
          filledQty: { increment: quantity },
          status:
            buyOrder.filledQty + quantity >= buyOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      }),

      this.prisma.order.update({
        where: { id: sellOrder.id },
        data: {
          filledQty: { increment: quantity },
          status:
            sellOrder.filledQty + quantity >= sellOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      }),
    ]);
  }
}