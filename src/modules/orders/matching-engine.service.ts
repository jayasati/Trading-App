import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderBookService } from './order-book.service';
import {
  OrderSide,
  OrderStatus,
  Prisma,
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
    let order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== OrderStatus.OPEN) return;

    const matches =
      order.side === OrderSide.BUY
        ? this.orderBook.matchBuy(order)
        : this.orderBook.matchSell(order);

    console.log(`🔥 Processing ${order.side} order ${orderId}, found ${matches.length} matches`);

    for (const match of matches) {
      // Refresh order to get latest filledQty
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order || order.filledQty >= order.quantity) break;

      const tradeQty = Math.min(
        order.quantity - order.filledQty,
        match.quantity,
      );

      // Skip if no quantity to trade
      if (tradeQty <= 0) continue;

      const tradePrice = match.price;
      const tradeValue = new Prisma.Decimal(tradePrice).mul(tradeQty);

      // Determine buyer and seller
      const buyerId = order.side === OrderSide.BUY ? order.userId : match.userId;
      const sellerId = order.side === OrderSide.SELL ? order.userId : match.userId;
      const buyOrderId = order.side === OrderSide.BUY ? order.id : match.orderId;
      const sellOrderId = order.side === OrderSide.SELL ? order.id : match.orderId;

      console.log(`💱 Trade: ${tradeQty} @ ${tradePrice}, buyer=${buyerId.slice(0,8)}, seller=${sellerId.slice(0,8)}`);

      // 🧾 CREATE TRADE
      await this.prisma.trade.create({
        data: {
          buyOrderId,
          sellOrderId,
          stockId: order.stockId,
          price: tradePrice,
          quantity: tradeQty,
        },
      });

      // 📊 UPDATE ORDERS with correct status
      // Update incoming order
      const newIncomingFilledQty = order.filledQty + tradeQty;
      const incomingFullyFilled = newIncomingFilledQty >= order.quantity;
      
      console.log(`📊 Incoming order: ${order.filledQty} + ${tradeQty} = ${newIncomingFilledQty} / ${order.quantity}`);
      console.log(`📊 Incoming fully filled? ${incomingFullyFilled}`);

      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          filledQty: newIncomingFilledQty,
          status: incomingFullyFilled 
            ? OrderStatus.FILLED 
            : OrderStatus.PARTIALLY_FILLED,
        },
      });

      // Update matched order
      const matchOrder = await this.prisma.order.findUnique({
        where: { id: match.orderId },
      });

      if (matchOrder) {
        const newMatchFilledQty = matchOrder.filledQty + tradeQty;
        const matchFullyFilled = newMatchFilledQty >= matchOrder.quantity;
        
        console.log(`📊 Match order: ${matchOrder.filledQty} + ${tradeQty} = ${newMatchFilledQty} / ${matchOrder.quantity}`);
        console.log(`📊 Match fully filled? ${matchFullyFilled}`);

        const updatedMatchOrder = await this.prisma.order.update({
          where: { id: match.orderId },
          data: {
            filledQty: newMatchFilledQty,
            status: matchFullyFilled 
              ? OrderStatus.FILLED 
              : OrderStatus.PARTIALLY_FILLED,
          },
        });

        // 🗑️ CLEANUP ORDER BOOK
        if (incomingFullyFilled) {
          this.orderBook.removeFilledOrder(
            order.stockId,
            order.id,
            order.side === OrderSide.BUY ? 'BUY' : 'SELL'
          );
          console.log(`🗑️ Removed incoming ${order.side} order from book`);
        } else {
          this.orderBook.updateOrder(order.stockId, order.id, newIncomingFilledQty);
          console.log(`🔄 Updated incoming order filledQty in book: ${newIncomingFilledQty}`);
        }

        if (matchFullyFilled) {
          this.orderBook.removeFilledOrder(
            order.stockId,
            match.orderId,
            order.side === OrderSide.BUY ? 'SELL' : 'BUY'
          );
          console.log(`🗑️ Removed matched ${order.side === OrderSide.BUY ? 'SELL' : 'BUY'} order from book`);
        } else {
          this.orderBook.updateOrder(order.stockId, match.orderId, newMatchFilledQty);
          console.log(`🔄 Updated match order filledQty in book: ${newMatchFilledQty}`);
        }
      }

      // 💰 WALLET SETTLEMENT
      await this.walletService.consumeLockedFunds(buyerId, tradeValue);
      await this.walletService.creditBalance(sellerId, tradeValue);
      
      console.log(`💰 Wallet updated: buyer locked -${tradeValue}, seller balance +${tradeValue}`);
    }

    console.log(`✅ Order ${orderId} processing complete`);
  }
}