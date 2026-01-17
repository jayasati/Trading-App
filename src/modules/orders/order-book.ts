export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export class OrderBook {
  buy: OrderBookEntry[] = [];
  sell: OrderBookEntry[] = [];
}
