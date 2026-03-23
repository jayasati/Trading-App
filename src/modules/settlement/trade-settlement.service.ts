// src/modules/settlement/trade-settlement.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { HoldingsService } from '../portfolio/holdings/holding.service';
import { PositionsService } from '../positions/positions.service';
import { OrderCategory } from '../../generated/prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

export interface TradeSettlementInput {
  buyOrderId:  string;   // 'MARKET_BOOK' when user is selling against market
  sellOrderId: string;   // 'MARKET_BOOK' when user is buying against market
  buyerId:     string;   // 'MARKET_BOOK' when user is selling against market
  sellerId:    string;   // 'MARKET_BOOK' when user is buying against market
  stockId:     string;
  price:       number;
  quantity:    number;
  category:    OrderCategory;
}

@Injectable()
export class TradeSettlementService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly wallet:    WalletService,
    private readonly holdings:  HoldingsService,
    private readonly positions: PositionsService,
  ) {}

  async settleTrade(input: TradeSettlementInput) {
    const {
      buyOrderId, sellOrderId,
      buyerId, sellerId,
      stockId, price, quantity, category,
    } = input;

    const tradeValue = new Decimal(price * quantity);

    // 'MARKET_BOOK' = this side is real market liquidity, not a real user order
    const userIsBuying  = sellerId === 'MARKET_BOOK'; // user placed BUY
    const userIsSelling = buyerId  === 'MARKET_BOOK'; // user placed SELL

    // ── Resolve real order IDs for the Trade FK constraint ─────────────────
    // Trade.buyOrderId and Trade.sellOrderId MUST reference real Order rows.
    // When one side is MARKET_BOOK, use the user's real order ID for both.
    const realBuyOrderId  = buyOrderId  === 'MARKET_BOOK' ? sellOrderId : buyOrderId;
    const realSellOrderId = sellOrderId === 'MARKET_BOOK' ? buyOrderId  : sellOrderId;

    return this.prisma.$transaction(async (tx) => {

      if (userIsBuying) {
        // User BUY against real ask levels
        await this.wallet.consumeLockedFunds(buyerId, tradeValue, tx);

        if (category === OrderCategory.DELIVERY) {
          await this.holdings.addHolding(buyerId, stockId, quantity, tx, price);
        } else {
          await this.positions.addBuy(buyerId, stockId, quantity, price, tx);
        }

      } else if (userIsSelling) {
        // User SELL against real bid levels
        await this.wallet.creditBalance(sellerId, tradeValue, tx);

        if (category === OrderCategory.DELIVERY) {
          await this.holdings.removeHolding(sellerId, stockId, quantity, tx);
        } else {
          await this.positions.addSell(sellerId, stockId, quantity, price, tx);
        }

      } else {
        // Normal LIMIT-to-LIMIT match between two real users
        await this.wallet.consumeLockedFunds(buyerId, tradeValue, tx);
        await this.wallet.creditBalance(sellerId, tradeValue, tx);

        if (category === OrderCategory.DELIVERY) {
          await this.holdings.addHolding(buyerId, stockId, quantity, tx, price);
          await this.holdings.removeHolding(sellerId, stockId, quantity, tx);
        } else {
          await this.positions.addBuy(buyerId, stockId, quantity, price, tx);
          await this.positions.addSell(sellerId, stockId, quantity, price, tx);
        }
      }

      // Always use real order IDs — 'MARKET_BOOK' is not a valid FK reference
      return tx.trade.create({
        data: {
          buyOrderId:  realBuyOrderId,
          sellOrderId: realSellOrderId,
          stockId,
          price,
          quantity,
        },
      });
    });
  }
}