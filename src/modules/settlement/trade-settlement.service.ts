
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { HoldingsService } from '../portfolio/holdings/holding.service';
import { PositionsService } from '../positions/positions.service';
import { OrderCategory } from '../../generated/prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

export interface TradeSettlementInput {
  buyOrderId:  string;
  sellOrderId: string;
  buyerId:     string;
  sellerId:    string;
  stockId:     string;
  price:       number;
  quantity:    number;
  category:    OrderCategory; // ← NEW: determines settlement flow
}

@Injectable()
export class TradeSettlementService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly wallet:     WalletService,
    private readonly holdings:   HoldingsService,
    private readonly positions:  PositionsService,
  ) {}

  async settleTrade(input: TradeSettlementInput) {
    const {
      buyOrderId, sellOrderId,
      buyerId, sellerId,
      stockId, price, quantity, category,
    } = input;

    const tradeValue = new Decimal(price * quantity);

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Buyer: consume locked funds
      await this.wallet.consumeLockedFunds(buyerId, tradeValue, tx);

      // 2️⃣ Seller: credit money
      await this.wallet.creditBalance(sellerId, tradeValue, tx);

      if (category === OrderCategory.DELIVERY) {
        // ── DELIVERY: update Holdings ──
        await this.holdings.addHolding(buyerId, stockId, quantity, tx, price);
        await this.holdings.removeHolding(sellerId, stockId, quantity, tx);
      } else {
        // ── INTRADAY: update Positions ──
        await this.positions.addBuy(buyerId, stockId, quantity, price, tx);
        await this.positions.addSell(sellerId, stockId, quantity, price, tx);
      }

      // 3️⃣ Save trade record
      return tx.trade.create({
        data: {
          buyOrderId,
          sellOrderId,
          stockId,
          price,
          quantity,
        },
      });
    });
  }
}