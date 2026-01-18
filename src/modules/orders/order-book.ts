export interface OrderBookEntry {
  orderId: string;
  userId: string;
  price: number;
  remainingQty: number;
  createdAt: Date;
}

export class OrderBook {
  buy: OrderBookEntry[] = [];
  sell: OrderBookEntry[] = [];
}
