import { Injectable, Logger } from '@nestjs/common';
import { PositionsService } from '../../positions/positions.service';
import { MarketDataService } from '../services/market-data.service';

@Injectable()
export class SquareOffJob {
  private readonly logger = new Logger(SquareOffJob.name);

  constructor(
    private positions: PositionsService,
    private marketData: MarketDataService,
  ) {}

  async execute() {
    const positions = await this.positions.getAllOpenPositions();

    for (const pos of positions) {
      const quote = await this.marketData.fetchSingleQuote(
        pos.stock.yahooSymbol,
      );

      const price = quote?.price ?? Number(pos.avgBuyPrice);

      await this.positions.autoSquareOff(
        pos.stockId,
        pos.userId,
        pos.quantity,
        price,
      );
    }

    this.logger.log(`Square-off completed`);
  }
}