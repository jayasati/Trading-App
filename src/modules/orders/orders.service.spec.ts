import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderSide, OrderType } from '../../generated/prisma/client';
import { isMarketOpen } from '../../common/utils/market-hours';

jest.mock('../../common/utils/market-hours', () => ({
  isMarketOpen: jest.fn(),
}));

describe('OrdersService', () => {
  const prisma = {} as any;
  const matchingEngine = {} as any;
  const orderBook = { removeorder: jest.fn() } as any;
  const deliveryStrategy = {
    validate: jest.fn(),
    prepareFunds: jest.fn(),
    releaseFunds: jest.fn(),
  } as any;
  const intradayStrategy = {
    validate: jest.fn(),
    prepareFunds: jest.fn(),
    releaseFunds: jest.fn(),
  } as any;
  const tradeSettlement = {} as any;
  const marketData = { fetchSingleQuote: jest.fn() } as any;

  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    (isMarketOpen as jest.Mock).mockReturnValue(false);
    service = new OrdersService(
      prisma,
      matchingEngine,
      orderBook,
      deliveryStrategy,
      intradayStrategy,
      tradeSettlement,
      marketData,
    );
  });

  it('after-hours MARKET without price throws explicit error', async () => {
    await expect(
      service.placeOrder({
        userId: 'u1',
        stockId: 's1',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 1,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Price is required for LIMIT/STOP_LOSS and after-hours MARKET orders.',
      ),
    );
  });
});
