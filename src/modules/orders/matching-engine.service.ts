// src/modules/orders/matching-engine.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TradeSettlementService } from '../settlement/trade-settlement.service';
import { OrderSide, OrderStatus } from '../../generated/prisma/client';

export interface MarketLevel {
  price:    number;
  quantity: number;
}

export interface MarketDepthInput {
  bids: MarketLevel[];
  asks: MarketLevel[];
}

@Injectable()
export class MatchingEngineService {
  private readonly logger = new Logger(MatchingEngineService.name);

  constructor(
    private readonly prisma:          PrismaService,
    private readonly tradeSettlement: TradeSettlementService,
  ) {}

  async processOrder(orderId: string, depth: MarketDepthInput) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== OrderStatus.OPEN) return;

    const levels = order.side === OrderSide.BUY
      ? depth.asks
      : depth.bids;

    const levelSide = order.side === OrderSide.BUY ? 'ASK' : 'BID';

    let remainingQty = order.quantity - order.filledQty;
    let totalFilled  = 0;

    for (const level of levels) {
      if (remainingQty <= 0) break;

      const limitPrice = Number(order.price);
      const priceMatch = levelSide === 'ASK'
        ? limitPrice >= level.price
        : limitPrice <= level.price;

      if (!priceMatch) break;

      const fillQty   = Math.min(remainingQty, level.quantity);
      const fillPrice = level.price;

      await this.tradeSettlement.settleTrade({
        buyOrderId:  order.side === OrderSide.BUY  ? order.id : 'MARKET_BOOK',
        sellOrderId: order.side === OrderSide.SELL ? order.id : 'MARKET_BOOK',
        buyerId:     order.side === OrderSide.BUY  ? order.userId : 'MARKET_BOOK',
        sellerId:    order.side === OrderSide.SELL ? order.userId : 'MARKET_BOOK',
        stockId:     order.stockId,
        price:       fillPrice,
        quantity:    fillQty,
        category:    order.category,
      });

      remainingQty -= fillQty;
      totalFilled  += fillQty;

      this.logger.log(
        `Matched ${fillQty} × stockId:${order.stockId} @ ₹${fillPrice} ` +
        `against ${levelSide} level (order ${order.id})`
      );
    }

    if (totalFilled > 0) {
      const newFilledQty = order.filledQty + totalFilled;
      const newStatus    = newFilledQty >= order.quantity
        ? OrderStatus.FILLED
        : OrderStatus.PARTIALLY_FILLED;

      await this.prisma.order.update({
        where: { id: order.id },
        data:  { filledQty: newFilledQty, status: newStatus },
      });

      this.logger.log(`Order ${order.id} → ${newStatus} (${newFilledQty}/${order.quantity})`);
    }
  }
}