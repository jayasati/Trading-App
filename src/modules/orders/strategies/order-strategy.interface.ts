import { PlaceOrderInput } from '../types/place-order-input.type';
import { ReleaseFundsOrder } from '../types/release-funds-order.type';

// Any new order type just implements this interface — no changes to OrdersService
export interface OrderStrategy {
  validate(data: PlaceOrderInput): Promise<void>;
  prepareFunds(data: PlaceOrderInput, tx?: any): Promise<void>;
  releaseFunds(order: ReleaseFundsOrder, unfilledQty: number, tx: any): Promise<void>;
}