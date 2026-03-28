import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchingEngineService } from '../../orders/matching-engine.service';
import { DepthBuilderService } from '../domain/depth/depth-builder.service';
import { OrderStatus, OrderCategory } from '../../../generated/prisma/client';
import { isMarketOpen } from '../../../common/utils/market-hours';


@Injectable()
export class OrderRetryJob {
  private readonly logger = new Logger(OrderRetryJob.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private matchingEngine: MatchingEngineService,
    private depthBuilder: DepthBuilderService,
  ) {}

  async execute() {
    if (!isMarketOpen() || this.isRunning) return;
    this.isRunning = true;

    try {
      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
          type: 'LIMIT',
          category: OrderCategory.DELIVERY,
        },
        include: { stock: true },
      });

      const grouped = new Map<string, any[]>();

      for (const o of orders) {
        const list = grouped.get(o.stockId) || [];
        list.push(o);
        grouped.set(o.stockId, list);
      }

      for (const [, group] of grouped) {
        const symbol = group[0].stock.yahooSymbol;
        const depth = await this.depthBuilder.build(symbol);

        if (!depth) continue;

        await Promise.all(
          group.map(o => this.matchingEngine.processOrder(o.id, depth))
        );
      }

      this.logger.log(`Retried orders`);
    } catch (err: any) {
      this.logger.error(err.message);
    } finally {
      this.isRunning = false;
    }
  }
}