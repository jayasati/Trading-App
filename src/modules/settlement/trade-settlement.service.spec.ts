import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { OrderCategory } from '../../generated/prisma/client';
import { TradeSettlementService } from './trade-settlement.service';

describe('TradeSettlementService short-cover invariants', () => {
  const prisma = {
    $transaction: jest.fn(),
  } as any;

  const wallet = {
    consumeLockedFunds: jest.fn(),
    releaseFunds: jest.fn(),
    creditBalance: jest.fn(),
  } as any;

  const holdings = {
    addHolding: jest.fn(),
    removeHolding: jest.fn(),
  } as any;

  const positions = {
    getTradingDate: jest.fn(() => new Date('2026-04-02T00:00:00.000Z')),
    addBuy: jest.fn(),
    addSell: jest.fn(),
  } as any;

  let service: TradeSettlementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TradeSettlementService(prisma, wallet, holdings, positions);
  });

  it('open short then cover at profit: releases short margin and credits profit', async () => {
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        position: {
          findUnique: jest.fn().mockResolvedValue({
            buyQty: 0,
            sellQty: 10,
            avgSellPrice: new Decimal(100),
          }),
        },
        trade: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      }),
    );

    await service.settleTrade({
      buyOrderId: 'o1',
      sellOrderId: 'MARKET_BOOK',
      buyerId: 'u1',
      sellerId: 'MARKET_BOOK',
      stockId: 's1',
      price: 90,
      quantity: 5,
      category: OrderCategory.INTRADAY,
    });

    // BUY cover margin at buy price: 90*5/5 = 90
    expect(wallet.releaseFunds).toHaveBeenCalledWith('u1', expect.any(Decimal), expect.anything());
    const firstRelease = wallet.releaseFunds.mock.calls[0][1] as Decimal;
    expect(firstRelease.toNumber()).toBe(90);

    // Return short margin: 100*5/5 = 100
    const secondRelease = wallet.releaseFunds.mock.calls[1][1] as Decimal;
    expect(secondRelease.toNumber()).toBe(100);

    // Profit credit: (100-90)*5 = 50
    const profit = wallet.creditBalance.mock.calls[0][1] as Decimal;
    expect(profit.toNumber()).toBe(50);
    expect(wallet.consumeLockedFunds).not.toHaveBeenCalled();
    expect(positions.addBuy).toHaveBeenCalledWith('u1', 's1', 5, 90, expect.anything());
  });

  it('open short then cover at loss within margin: consumes loss, releases remaining margin', async () => {
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        position: {
          findUnique: jest.fn().mockResolvedValue({
            buyQty: 0,
            sellQty: 10,
            avgSellPrice: new Decimal(100),
          }),
        },
        trade: { create: jest.fn().mockResolvedValue({ id: 't2' }) },
      }),
    );

    await service.settleTrade({
      buyOrderId: 'o2',
      sellOrderId: 'MARKET_BOOK',
      buyerId: 'u1',
      sellerId: 'MARKET_BOOK',
      stockId: 's1',
      price: 110,
      quantity: 5,
      category: OrderCategory.INTRADAY,
    });

    // Cover buy-margin released first: 110*5/5 = 110
    const buyMarginRelease = wallet.releaseFunds.mock.calls[0][1] as Decimal;
    expect(buyMarginRelease.toNumber()).toBe(110);

    // Loss: (110-100)*5 = 50 consumed from short margin
    const lossConsumed = wallet.consumeLockedFunds.mock.calls[0][1] as Decimal;
    expect(lossConsumed.toNumber()).toBe(50);

    // Remaining short margin returned: 100 - 50 = 50
    const remainingRelease = wallet.releaseFunds.mock.calls[1][1] as Decimal;
    expect(remainingRelease.toNumber()).toBe(50);
    expect(wallet.creditBalance).not.toHaveBeenCalled();
  });

  it('open short then cover at loss above margin: throws and aborts', async () => {
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        position: {
          findUnique: jest.fn().mockResolvedValue({
            buyQty: 0,
            sellQty: 10,
            avgSellPrice: new Decimal(100),
          }),
        },
        trade: { create: jest.fn().mockResolvedValue({ id: 't3' }) },
      }),
    );

    await expect(
      service.settleTrade({
        buyOrderId: 'o3',
        sellOrderId: 'MARKET_BOOK',
        buyerId: 'u1',
        sellerId: 'MARKET_BOOK',
        stockId: 's1',
        price: 160,
        quantity: 5,
        category: OrderCategory.INTRADAY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Short margin for covered qty is 100 and gets consumed before throw.
    const consumed = wallet.consumeLockedFunds.mock.calls[0][1] as Decimal;
    expect(consumed.toNumber()).toBe(100);
    expect(positions.addBuy).not.toHaveBeenCalled();
  });
});
