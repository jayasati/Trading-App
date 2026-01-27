import { Order } from '../../generated/prisma/client';




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

  

  remove(orderId: string, side: 'BUY' | 'SELL') {
    if (side === 'BUY') {
      this.buyOrders = this.buyOrders.filter(o => o.id !== orderId);
    } else {
      this.sellOrders = this.sellOrders.filter(o => o.id !== orderId);
    }
  }

  getBuyOrders(){
    return [...this.buyOrders];
  }

  getSellOrders(){
    return [...this.sellOrders];
  }



}