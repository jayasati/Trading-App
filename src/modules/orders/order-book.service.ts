import { Injectable } from '@nestjs/common';
import { OrderBook } from './order-book';
import { Order } from '../../generated/prisma/client';

@Injectable()
export class OrderBookService {
  private readonly books = new Map<string, OrderBook>();

  getBook(stockId: string): OrderBook {
    let book = this.books.get(stockId);

    if (!book) {
      book = new OrderBook();
      this.books.set(stockId, book);
    }

    return book;
  }

  addOrder(order:Order){
    const book=this.getBook(order.stockId);
    order.side==='BUY'?book.addBuy(order):book.addSell(order);
  }

  removeorder(stockId:string ,orderId:string,side:'BUY'|'SELL'){
    this.getBook(stockId).remove(orderId,side);
  }



}