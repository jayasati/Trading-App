import { Injectable, Logger } from '@nestjs/common';
import { YahooAuthService } from './yahoo-auth.service';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type ChartInterval =
  | '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m'
  | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo';

@Injectable()
export class YahooChartService {
  private readonly logger = new Logger(YahooChartService.name);

  constructor(private readonly auth: YahooAuthService) {}

  async fetch(symbol: string, period: string) {
    await this.auth.init();

    // Bug fix: period was accepted but completely ignored.
    // The old code computed period1, period2 and interval from the period string.
    const { startDate, interval } = this.getPeriodConfig(period);
    const p1 = Math.floor(startDate.getTime() / 1000);
    const p2 = Math.floor(Date.now() / 1000);

    const safeSymbol = symbol.replace(/ /g, '+');
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${safeSymbol}` +
      `?period1=${p1}&period2=${p2}&interval=${interval}` +
      `&crumb=${encodeURIComponent(this.auth.getCrumb())}`;

    const res = await fetch(url, {
      headers: {
        ...this.auth.getHeaders(),
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      this.logger.warn(`Chart fetch HTTP ${res.status} for ${symbol}`);
      return null;
    }

    const data  = await res.json();
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp              as number[];
    const ohlcv      = chart.indicators?.quote?.[0] as any;

    return timestamps
      .map((ts, idx) => ({
        date:   new Date(ts * 1000),
        open:   Number(ohlcv.open?.[idx])   || 0,
        high:   Number(ohlcv.high?.[idx])   || 0,
        low:    Number(ohlcv.low?.[idx])    || 0,
        close:  Number(ohlcv.close?.[idx])  || 0,
        volume: Number(ohlcv.volume?.[idx]) || 0,
      }))
      .filter((b) => b.close > 0);
  }

  private getPeriodConfig(period: string): { startDate: Date; interval: ChartInterval } {
    const now = new Date();
    const map: Record<string, { days: number; interval: ChartInterval }> = {
      '1D': { days: 1,    interval: '1m'  },
      '1W': { days: 7,    interval: '15m' },
      '1M': { days: 30,   interval: '1d'  },
      '3M': { days: 90,   interval: '1d'  },
      '1Y': { days: 365,  interval: '1wk' },
      '5Y': { days: 1825, interval: '1mo' },
    };
    const config    = map[period] ?? map['1M'];
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - config.days);
    return { startDate, interval: config.interval };
  }
}