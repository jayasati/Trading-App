import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { HoldingsService } from '../portfolio/holding.service';
import { Decimal } from '@prisma/client/runtime/client';


export interface TradeSettlementInput {
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  stockId: string;
  price: number;
  quantity: number;
}

@Injectable()
export class TradeSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly holdingsService: HoldingsService,
  ) { }

  async settleTrade(input: TradeSettlementInput) {
    const { buyOrderId, sellOrderId, buyerId, sellerId, stockId, price, quantity } = input;
    const tradeValue = new Decimal(price * quantity);

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Buyer: consume locked funds
      await this.walletService.consumeLockedFunds(

        buyerId,
        tradeValue,
        tx,
      );

      // 2️⃣ Seller: credit money
      await this.walletService.creditBalance(

        sellerId,
        tradeValue,
        tx,
      );

      // 3️⃣ Buyer: add stock
      await this.holdingsService.addHolding(

        buyerId,
        stockId,
        quantity,
        tx,
      );

      // 4️⃣ Seller: remove stock
      await this.holdingsService.removeHolding(

        sellerId,
        stockId,
        quantity,
        tx,
      );

      // 5️⃣ Save trade
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
