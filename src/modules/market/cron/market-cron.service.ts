import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PriceRefreshJob } from '../jobs/price-refresh.job';
import { OrderRetryJob } from '../jobs/order-retry.job';
import { CancelOrdersJob } from '../jobs/cancel-orders.job';
import { SquareOffJob } from '../jobs/squareoff.job';

@Injectable()
export class MarketCronService {
  constructor(
    private readonly priceJob: PriceRefreshJob,
    private readonly retryJob: OrderRetryJob,
    private readonly cancelJob: CancelOrdersJob,
    private readonly squareOffJob: SquareOffJob,
  ) {}

  @Cron('*/10 * * * * *')
  async handlePriceRefresh() {
    await this.priceJob.execute();
  }

  @Cron('*/10 * * * * *')
  async handleOrderRetry() {
    await this.retryJob.execute();
  }

  @Cron('30 15 * * 1-5', { timeZone: 'Asia/Kolkata' })
  async handleCancelOrders() {
    await this.cancelJob.execute();
  }

  @Cron('20 15 * * 1-5', { timeZone: 'Asia/Kolkata' })
  async handleSquareOff() {
    await this.squareOffJob.execute();
  }
}