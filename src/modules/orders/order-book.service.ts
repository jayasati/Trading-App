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

  addBuy(stockId: string, price: number, quantity: number) {
    this.getBook(stockId).buy.push({ price, quantity });
  }

  addSell(stockId: string, price: number, quantity: number) {
    this.getBook(stockId).sell.push({ price, quantity });
  }
}
