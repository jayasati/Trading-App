import { Injectable } from '@nestjs/common';
import { OrderBook } from './order-book';

@Injectable()
export class OrderBookService {
  private books = new Map<string, OrderBook>();

  getBook(stockId: string): OrderBook {
    let book = this.books.get(stockId);

    if (!book) {
      book = new OrderBook();
      this.books.set(stockId, book);
    }

    return book;
  }

  addBuy(order) {
    this.getBook(order.stockId).buy.push({
      orderId: order.id,
      userId: order.userId,
      price: order.price,
      remainingQty: order.quantity,
      createdAt: order.createdAt,
    });
  }

  addSell(order) {
    this.getBook(order.stockId).sell.push({
      orderId: order.id,
      userId: order.userId,
      price: order.price,
      remainingQty: order.quantity,
      createdAt: order.createdAt,
    });
  }
}
