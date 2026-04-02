import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { OrderSide, OrderType } from '../../../generated/prisma/client';

describe('CreateOrderDto price rules', () => {
  const base = {
    stockId: '11111111-1111-1111-1111-111111111111',
    side: OrderSide.BUY,
    quantity: 1,
  };

  it('MARKET without price is valid', async () => {
    const dto = Object.assign(new CreateOrderDto(), {
      ...base,
      type: OrderType.MARKET,
    });

    const errors = await validate(dto);
    const priceErrors = errors.filter((e) => e.property === 'price');
    expect(priceErrors).toHaveLength(0);
  });

  it('LIMIT without price is invalid', async () => {
    const dto = Object.assign(new CreateOrderDto(), {
      ...base,
      type: OrderType.LIMIT,
    });

    const errors = await validate(dto);
    const priceError = errors.find((e) => e.property === 'price');
    expect(priceError).toBeDefined();
  });
});
