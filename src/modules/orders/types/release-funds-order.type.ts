import { OrderCategory, OrderSide, Prisma } from '../../../generated/prisma/client';

export type ReleaseFundsOrder = {
  userId: string;
  stockId: string;
  side: OrderSide;
  category: OrderCategory;
  price: number | Prisma.Decimal | null;
};
