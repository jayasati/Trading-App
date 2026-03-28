import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderGroupingService {
  groupByStock(orders: any[]) {
    const map = new Map<string, any[]>();

    for (const o of orders) {
      const list = map.get(o.stockId) || [];
      list.push(o);
      map.set(o.stockId, list);
    }

    return map;
  }
}