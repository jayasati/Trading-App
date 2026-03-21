// Responsibility: ONLY WebSocket price broadcasting
import { Injectable } from '@nestjs/common';
import { MarketGateway } from '../gateways/market.gateway';

@Injectable()
export class MarketBroadcastService {
  constructor(private readonly gateway: MarketGateway) {}

  broadcast(
    stockId: string,
    price: number,
    ohlcv?: { open: number; high: number; low: number; close: number; volume: number },
  ) {
    this.gateway.broadcastPrice(stockId, price, ohlcv);
  }
}