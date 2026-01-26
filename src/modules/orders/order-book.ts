import { Order } from '../../generated/prisma/client';

export interface MatchResult {
  orderId: string;
  userId: string;
  price: number;
  quantity: number;
}

export class OrderBook {
  private buyOrders: Order[] = [];
  private sellOrders: Order[] = [];

  // ➕ ADDERS
  addBuy(order: Order) {
    this.buyOrders.push(order);
    // Sort by price DESC (highest first), then by time ASC (oldest first)
    this.buyOrders.sort((a, b) => {
      const priceDiff = Number(b.price) - Number(a.price);
      if (priceDiff !== 0) return priceDiff;
      // Same price? Oldest order first (FIFO)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  addSell(order: Order) {
    this.sellOrders.push(order);
    // Sort by price ASC (lowest first), then by time ASC (oldest first)
    this.sellOrders.sort((a, b) => {
      const priceDiff = Number(a.price) - Number(b.price);
      if (priceDiff !== 0) return priceDiff;
      // Same price? Oldest order first (FIFO)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  // 🔥 MATCH BUY ORDER
  matchBuy(order: Order): MatchResult[] {
    const matches: MatchResult[] = [];
    let remainingQty = order.quantity - order.filledQty;

    for (const sell of this.sellOrders) {
      if (remainingQty <= 0) break;
      if (!sell.price || !order.price) continue;
      if (sell.price > order.price) break;

      const availableQty = sell.quantity - sell.filledQty;
      if (availableQty <= 0) continue;

      const tradedQty = Math.min(remainingQty, availableQty);

      // Only add match if there's actually quantity to trade
      if (tradedQty > 0) {
        matches.push({
          orderId: sell.id,
          userId: sell.userId,
          price: Number(sell.price),
          quantity: tradedQty,
        });

        remainingQty -= tradedQty;
      }
    }

    return matches;
  }

  // 🔥 MATCH SELL ORDER
  matchSell(order: Order): MatchResult[] {
    const matches: MatchResult[] = [];
    let remainingQty = order.quantity - order.filledQty;

    for (const buy of this.buyOrders) {
      if (remainingQty <= 0) break;
      if (!buy.price || !order.price) continue;
      if (buy.price < order.price) break;

      const availableQty = buy.quantity - buy.filledQty;
      if (availableQty <= 0) continue;

      const tradedQty = Math.min(remainingQty, availableQty);

      // Only add match if there's actually quantity to trade
      if (tradedQty > 0) {
        matches.push({
          orderId: buy.id,
          userId: buy.userId,
          price: Number(buy.price),
          quantity: tradedQty,
        });

        remainingQty -= tradedQty;
      }
    }

    return matches;
  }

  // 🗑️ REMOVE FILLED ORDERS (CRITICAL!)
  removeFilledOrders(orderId: string, side: 'BUY' | 'SELL') {
    if (side === 'BUY') {
      this.buyOrders = this.buyOrders.filter(o => o.id !== orderId);
    } else {
      this.sellOrders = this.sellOrders.filter(o => o.id !== orderId);
    }
  }

  // 🔄 UPDATE ORDER IN BOOK (for partial fills)
  updateOrder(orderId: string, filledQty: number) {
    const buyOrder = this.buyOrders.find(o => o.id === orderId);
    if (buyOrder) {
      buyOrder.filledQty = filledQty;
      return;
    }

    const sellOrder = this.sellOrders.find(o => o.id === orderId);
    if (sellOrder) {
      sellOrder.filledQty = filledQty;
    }
  }
}