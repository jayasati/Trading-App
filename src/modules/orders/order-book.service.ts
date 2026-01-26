import { Injectable } from '@nestjs/common';
import { OrderBook } from './order-book';
import { Order } from '../../generated/prisma/client';

@Injectable()
export class OrderBookService {
  private books = new Map<string, OrderBook>();

  private getBook(stockId: string): OrderBook {
    if (!this.books.has(stockId)) {
      this.books.set(stockId, new OrderBook());
    }
    return this.books.get(stockId)!;
  }

  // ➕ ADD ORDERS
  addBuy(order: Order) {
    this.getBook(order.stockId).addBuy(order);
    const book = this.getBook(order.stockId);
  }

  addSell(order: Order) {
    this.getBook(order.stockId).addSell(order);
    const book = this.getBook(order.stockId);
  }

  // 🔍 MATCH ORDERS
  matchBuy(order: Order) {
    const book = this.getBook(order.stockId); 
    const matches = book.matchBuy(order);
    return matches;
  }

  matchSell(order: Order) {
    const book = this.getBook(order.stockId);
    const matches = book.matchSell(order);
    return matches;
  }

  // 🗑️ REMOVE FILLED ORDER
  removeFilledOrder(stockId: string, orderId: string, side: 'BUY' | 'SELL') {
    this.getBook(stockId).removeFilledOrders(orderId, side);
    const book = this.getBook(stockId);
  }

  // 🔄 UPDATE ORDER
  updateOrder(stockId: string, orderId: string, filledQty: number) {
    this.getBook(stockId).updateOrder(orderId, filledQty);
  }
}