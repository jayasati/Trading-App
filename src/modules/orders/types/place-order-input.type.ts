import { OrderCategory, OrderSide, OrderType } from '../../../generated/prisma/client';

export type PlaceOrderInput = {
  userId: string;
  stockId: string;
  side: OrderSide;
  type: OrderType;
  category?: OrderCategory;
  price?: number;
  quantity: number;
};
