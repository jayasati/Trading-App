import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface LiveQuote {
  symbol:     string;
  yahooSymbol: string;
  price:      number;
  open:       number;
  high:       number;
  low:        number;
  close:      number;
  volume:     number;
  change:     number;
  changePct:  number;
  marketCap?: number;
}

export interface HistoricalBar {
  date:   Date;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

type ChartInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo';

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger  = new Logger(MarketDataService.name);
  private cookies          = '';
  private crumb            = '';
  private credentialsFetched = false;

  // ─── Init: fetch Yahoo crumb + cookies once on startup ───
  async onModuleInit() {
    await this.refreshCredentials();
  }

  // ─────────────────────────────────────────────────────────────
  // refreshCredentials
  // Manually fetches Yahoo Finance session cookies and crumb.
  // yahoo-finance2's built-in cookie fetcher broke when Yahoo
  // stopped redirecting through guce.yahoo.com.
  // ─────────────────────────────────────────────────────────────
  private async refreshCredentials(): Promise<void> {
    try {
      this.logger.log('Fetching Yahoo Finance session cookies...');

      // Step 1: Hit fc.yahoo.com to get the A= consent cookie
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': BROWSER_UA },
        redirect: 'follow',
      });

      const rawCookies = cookieRes.headers.getSetCookie?.() ??
        [cookieRes.headers.get('set-cookie') ?? ''];

      // Extract just the key=value part of each cookie (strip attributes)
      this.cookies = rawCookies
        .map((c: string) => c.split(';')[0])
        .filter(Boolean)
        .join('; ');

      // Step 2: Get crumb using those cookies
      const crumbRes = await fetch(
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
        {
          headers: {
            'User-Agent':      BROWSER_UA,
            'Accept':          '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie':          this.cookies,
          },
        },
      );

      const crumb = await crumbRes.text();

      if (!crumb || crumb.includes('<') || crumb.length > 20) {
        throw new Error(`Unexpected crumb response: ${crumb.slice(0, 50)}`);
      }

      this.crumb             = crumb;
      this.credentialsFetched = true;
      this.logger.log(`✅ Yahoo credentials ready. Crumb: ${this.crumb}`);

    } catch (err: any) {
      this.logger.error(`Failed to fetch Yahoo credentials: ${err.message}`);
      this.credentialsFetched = false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Raw Yahoo Finance quote API call
  // ─────────────────────────────────────────────────────────────
  private async fetchYahooQuotes(symbols: string[]): Promise<any[]> {
    if (!this.credentialsFetched) {
      await this.refreshCredentials();
    }

    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${encodeURIComponent(symbols.join(','))}` +
      `&crumb=${encodeURIComponent(this.crumb)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':      BROWSER_UA,
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin':          'https://finance.yahoo.com',
        'Referer':         'https://finance.yahoo.com/',
        'Cookie':          this.cookies,
      },
    });

    // If 401/403, our crumb expired — refresh and retry once
    if (res.status === 401 || res.status === 403) {
      this.logger.warn('Yahoo credentials expired, refreshing...');
      await this.refreshCredentials();
      return this.fetchYahooQuotes(symbols); // one retry
    }

    if (!res.ok) {
      throw new Error(`Yahoo returned HTTP ${res.status}`);
    }

    const text = await res.text();

    // Catch rate-limit responses that come back as plain text
    if (text.startsWith('Too Many')) {
      throw new Error('Too Many Requests');
    }

    const data = JSON.parse(text);
    return data?.quoteResponse?.result ?? [];
  }

  // ─────────────────────────────────────────────────────────────
  // getLiveQuotes — chunked batch fetch
  // ─────────────────────────────────────────────────────────────
  async getLiveQuotes(yahooSymbols: string[]): Promise<LiveQuote[]> {
    if (!yahooSymbols.length) return [];

    const CHUNK_SIZE  = 25;
    const CHUNK_DELAY = 1500;
    const MAX_RETRIES = 3;
    const chunks      = this.chunk(yahooSymbols, CHUNK_SIZE);
    const results: LiveQuote[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const quotes = await this.fetchYahooQuotes(chunk);

          for (const quote of quotes) {
            if (!quote?.regularMarketPrice) continue;
            results.push(this.mapQuote(quote));
          }

          this.logger.log(`Chunk ${i + 1}/${chunks.length}: fetched ${quotes.length} quotes`);
          break; // success

        } catch (err: any) {
          const isRateLimit = err.message?.includes('Too Many');
          if (attempt < MAX_RETRIES) {
            const delay = isRateLimit ? 5000 * attempt : 1000 * attempt;
            this.logger.warn(
              `Chunk ${i + 1} attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms...`,
            );
            await this.sleep(delay);
          } else {
            this.logger.error(`Chunk ${i + 1} failed after ${MAX_RETRIES} attempts: ${err.message}`);
          }
        }
      }

      if (i < chunks.length - 1) await this.sleep(CHUNK_DELAY);
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // fetchSingleQuote — for on-demand user requests
  // ─────────────────────────────────────────────────────────────
  async fetchSingleQuote(yahooSymbol: string): Promise<LiveQuote | null> {
    try {
      const quotes = await this.fetchYahooQuotes([yahooSymbol]);
      const quote  = quotes[0];
      if (!quote?.regularMarketPrice) return null;
      return this.mapQuote(quote);
    } catch (err: any) {
      this.logger.warn(`Failed to fetch quote for ${yahooSymbol}: ${err.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // getHistoricalData — OHLCV bars for charts
  // ─────────────────────────────────────────────────────────────
  async getHistoricalData(
    yahooSymbol: string,
    period: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y',
  ): Promise<HistoricalBar[]> {
    try {
      if (!this.credentialsFetched) await this.refreshCredentials();

      const { startDate, interval } = this.getPeriodConfig(period);

      const p1  = Math.floor(startDate.getTime() / 1000);
      const p2  = Math.floor(Date.now() / 1000);
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
        `?period1=${p1}&period2=${p2}&interval=${interval}&crumb=${encodeURIComponent(this.crumb)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept':     'application/json',
          'Cookie':     this.cookies,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data   = await res.json();
      const chart  = data?.chart?.result?.[0];
      if (!chart)  return [];

      const timestamps = chart.timestamp             as number[];
      const ohlcv      = chart.indicators?.quote?.[0] as any;

      return timestamps.map((ts, idx) => ({
        date:   new Date(ts * 1000),
        open:   Number(ohlcv.open?.[idx])   || 0,
        high:   Number(ohlcv.high?.[idx])   || 0,
        low:    Number(ohlcv.low?.[idx])    || 0,
        close:  Number(ohlcv.close?.[idx])  || 0,
        volume: Number(ohlcv.volume?.[idx]) || 0,
      })).filter((b) => b.close > 0);

    } catch (err: any) {
      this.logger.warn(`Historical fetch failed for ${yahooSymbol}: ${err.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  // searchStock — search Yahoo Finance for Indian stocks
  // ─────────────────────────────────────────────────────────────
  async searchStock(query: string): Promise<any[]> {
    try {
      if (!this.credentialsFetched) await this.refreshCredentials();

      const url =
        `https://query1.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(query)}&newsCount=0&crumb=${encodeURIComponent(this.crumb)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept':     'application/json',
          'Cookie':     this.cookies,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data   = await res.json();
      const quotes = (data?.quotes ?? []) as any[];

      return quotes
        .filter((q: any) => q.exchDisp === 'NSE' || q.exchDisp === 'BSE')
        .slice(0, 10)
        .map((q: any) => ({
          symbol:      q.symbol,
          name:        q.longname ?? q.shortname ?? q.symbol,
          exchange:    q.exchDisp,
          yahooSymbol: q.symbol,
        }));

    } catch (err: any) {
      this.logger.warn(`Search failed for "${query}": ${err.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  private mapQuote(quote: any): LiveQuote {
    const yahooSymbol = quote.symbol as string;
    return {
      symbol:    yahooSymbol.replace('.NS', '').replace('.BO', ''),
      yahooSymbol,
      price:     Number(quote.regularMarketPrice)         || 0,
      open:      Number(quote.regularMarketOpen)          || 0,
      high:      Number(quote.regularMarketDayHigh)       || 0,
      low:       Number(quote.regularMarketDayLow)        || 0,
      close:     Number(quote.regularMarketPreviousClose) || 0,
      volume:    Number(quote.regularMarketVolume)        || 0,
      change:    Number(quote.regularMarketChange)        || 0,
      changePct: Number(quote.regularMarketChangePercent) || 0,
      marketCap: quote.marketCap ? Number(quote.marketCap) : undefined,
    };
  }

  private getPeriodConfig(period: string): { startDate: Date; interval: ChartInterval } {
    const now = new Date();
    const map: Record<string, { days: number; interval: ChartInterval }> = {
      '1D': { days: 1,    interval: '5m'  },
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

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}