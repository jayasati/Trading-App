// Any new order type just implements this interface — no changes to OrdersService
export interface OrderStrategy {
  validate(data: any): Promise<void>;
  prepareFunds(data: any): Promise<void>;
  releaseFunds(order: any, unfilledQty: number, tx: any): Promise<void>;
}