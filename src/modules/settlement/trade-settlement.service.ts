// src/modules/settlement/trade-settlement.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { HoldingsService } from '../portfolio/holdings/holding.service';
import { PositionsService } from '../positions/positions.service';
import { OrderCategory } from '../../generated/prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { calculateIntradayMargin } from '../../common/utils/intraday-margin';

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
    return this.prisma.$transaction(async (tx) => this.settleTradeInTx(tx, input));
  }

  async settleTradeInTx(tx: any, input: TradeSettlementInput) {
    const {
      buyOrderId, sellOrderId,
      buyerId, sellerId,
      stockId, price, quantity, category,
    } = input;

    const tradeValue = new Decimal(price * quantity);

    // 'MARKET_BOOK' = this side is real market liquidity, not a real user order
    const userIsBuying  = sellerId === 'MARKET_BOOK'; // user placed BUY
    const userIsSelling = buyerId  === 'MARKET_BOOK'; // user placed SELL

    // ── Resolve real order IDs for the Trade FK constraint ──────────────────
    const realBuyOrderId  = buyOrderId  === 'MARKET_BOOK' ? sellOrderId : buyOrderId;
    const realSellOrderId = sellOrderId === 'MARKET_BOOK' ? buyOrderId  : sellOrderId;

      if (userIsBuying) {
        // ── USER BUYS ────────────────────────────────────────────────────────
        if (category === OrderCategory.INTRADAY) {
          await this.settleIntradayBuy(tx, buyerId, stockId, price, quantity);
        } else {
          // DELIVERY: full amount was locked at order time
          await this.wallet.consumeLockedFunds(buyerId, tradeValue, tx);
          await this.holdings.addHolding(buyerId, stockId, quantity, tx, price);
        }

      } else if (userIsSelling) {
        // ── USER SELLS ───────────────────────────────────────────────────────
        if (category === OrderCategory.INTRADAY) {
          await this.settleIntradaySell(tx, sellerId, stockId, price, quantity);
        } else {
          // DELIVERY sell: credit full sale proceeds, remove holding
          await this.wallet.creditBalance(sellerId, tradeValue, tx);
          await this.holdings.removeHolding(sellerId, stockId, quantity, tx);
        }

      } else {
        // ── USER vs USER (LIMIT-to-LIMIT match) ─────────────────────────────
        if (category === OrderCategory.INTRADAY) {
          await this.settleIntradayBuy(tx, buyerId, stockId, price, quantity);
          await this.settleIntradaySell(tx, sellerId, stockId, price, quantity);
        } else {
          await this.wallet.consumeLockedFunds(buyerId, tradeValue, tx);
          await this.wallet.creditBalance(sellerId, tradeValue, tx);
          await this.holdings.addHolding(buyerId, stockId, quantity, tx, price);
          await this.holdings.removeHolding(sellerId, stockId, quantity, tx);
        }
      }

      return tx.trade.create({
        data: {
          buyOrderId:  realBuyOrderId,
          sellOrderId: realSellOrderId,
          stockId,
          price,
          quantity,
        },
      });
  }

  /**
   * Settle an intraday SELL (closing a long position OR short selling).
   *
   * The wallet credit must reflect the 5x leverage correctly:
   *
   * ── Closing a long position ──────────────────────────────────────────────
   *   At BUY time:  locked margin  = avgBuyPrice × qty / 5
   *   At SELL time: credit = margin + P&L
   *                        = (avgBuyPrice × qty / 5) + (sellPrice - avgBuyPrice) × qty
   */
  private async settleIntradaySell(
    tx:       any,
    sellerId: string,
    stockId:  string,
    sellPrice: number,
    quantity:  number,
  ) {
    // Step 1: look up the existing position BEFORE updating it
    const tradingDate = this.positions.getTradingDate();
    const existingPos = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: {
          userId: sellerId,
          stockId,
          tradingDate,
        },
      },
    });

    const avgBuyPrice  = existingPos ? Number(existingPos.avgBuyPrice)  : 0;
    const currentBuyQty = existingPos ? existingPos.buyQty : 0;

    // Step 2: update position record (addSell handles long/short/mixed)
    await this.positions.addSell(sellerId, stockId, quantity, sellPrice, tx);

    // Step 3: compute the correct wallet credit
    let credit: Decimal;

    if (currentBuyQty > 0 && avgBuyPrice > 0) {
      // ── Closing (fully or partially) a long position ────────────────────
      // Only credit for the quantity being closed against existing buys.
      const closingQty  = Math.min(quantity, currentBuyQty);
      const margin      = calculateIntradayMargin(avgBuyPrice, closingQty);
      const pnl         = new Decimal((sellPrice - avgBuyPrice) * closingQty);
      credit            = margin.add(pnl);

      // Any remaining quantity beyond the existing long is a new short sell.
      // Short sells receive no immediate credit (profit/loss settled at cover).
      // (No additional credit needed here.)
    } else {
      // Pure short sell (or selling more into an existing short) — no immediate credit.
      // Profit/loss is realized only when the short is covered (BUY).
      credit = new Decimal(0);
    }

    // Cap at 0 to avoid accidentally debiting the wallet
    const safeCredit = credit.gt(0) ? credit : new Decimal(0);
    if (safeCredit.gt(0)) {
      await this.wallet.creditBalance(sellerId, safeCredit, tx);
    }
  }

  /**
   * Settle an intraday BUY.
   *
   * Two cases:
   * - Opening/increasing a long: consume buy-margin (20%).
   * - Covering a short: do NOT consume buy-margin for the covered qty; instead:
   *   - release the buy-margin locked for that qty
   *   - settle short P&L against the short margin (locked at short-open time)
   */
  private async settleIntradayBuy(
    tx: any,
    buyerId: string,
    stockId: string,
    buyPrice: number,
    quantity: number,
  ) {
    const tradingDate = this.positions.getTradingDate();
    const existingPos = await tx.position.findUnique({
      where: {
        userId_stockId_tradingDate: {
          userId: buyerId,
          stockId,
          tradingDate,
        },
      },
    });

    const currentSellQty = existingPos ? existingPos.sellQty : 0;
    const currentBuyQty = existingPos ? existingPos.buyQty : 0;
    const netShortQty = Math.max(currentSellQty - currentBuyQty, 0);
    const coverQty = Math.min(quantity, netShortQty);
    const openLongQty = quantity - coverQty;

    if (coverQty > 0) {
      // No buy-margin to release for the cover portion — prepareFunds
      // intentionally does not lock margin when a BUY is covering a short
      // (the short's collateral is already locked).

      const avgSellPrice = existingPos ? Number(existingPos.avgSellPrice) : 0;
      if (avgSellPrice <= 0) {
        throw new BadRequestException('Invalid short position average sell price');
      }

      // Short margin was locked when the short was opened.
      const shortMargin = calculateIntradayMargin(avgSellPrice, coverQty);
      const pnl = new Decimal((avgSellPrice - buyPrice) * coverQty); // >0 profit, <0 loss

      if (pnl.gte(0)) {
        // Return short margin + profit
        await this.wallet.releaseFunds(buyerId, shortMargin, tx);
        if (pnl.gt(0)) await this.wallet.creditBalance(buyerId, pnl, tx);
      } else {
        // Loss is paid out of the short margin.
        const loss = pnl.mul(-1);
        if (loss.gte(shortMargin)) {
          // Collateral fully consumed; any further loss is unsupported in this simplified model.
          await this.wallet.consumeLockedFunds(buyerId, shortMargin, tx);
          throw new BadRequestException('Short position loss exceeds locked margin');
        }
        await this.wallet.consumeLockedFunds(buyerId, loss, tx);
        await this.wallet.releaseFunds(buyerId, shortMargin.sub(loss), tx);
      }
    }

    if (openLongQty > 0) {
      const buyMarginOpenLong = calculateIntradayMargin(buyPrice, openLongQty);
      await this.wallet.consumeLockedFunds(buyerId, buyMarginOpenLong, tx);
    }

    await this.positions.addBuy(buyerId, stockId, quantity, buyPrice, tx);
  }
}