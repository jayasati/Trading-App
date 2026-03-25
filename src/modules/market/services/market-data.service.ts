import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface LiveQuote {
  symbol:      string;
  yahooSymbol: string;
  price:       number;
  open:        number;
  high:        number;
  low:         number;
  close:       number;
  volume:      number;
  change:      number;
  changePct:   number;
  marketCap?:  number;
}

export interface HistoricalBar {
  date:   Date;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface NewsItem {
  title:     string;
  publisher: string;
  link:      string;
  timeAgo:   string;
}

type ChartInterval =
  | '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m'
  | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo';

interface StockMeta {
  companyName: string;
  aliases:     string[];
}

const STOCK_META: Record<string, StockMeta> = {
  'RELIANCE':   { companyName: 'Reliance Industries',    aliases: ['RIL'] },
  'TCS':        { companyName: 'Tata Consultancy',       aliases: ['TCS'] },
  'INFY':       { companyName: 'Infosys',                aliases: ['Infosys'] },
  'HDFCBANK':   { companyName: 'HDFC Bank',              aliases: ['HDFC Bank'] },
  'ICICIBANK':  { companyName: 'ICICI Bank',             aliases: ['ICICI Bank'] },
  'KOTAKBANK':  { companyName: 'Kotak Mahindra Bank',    aliases: ['Kotak Bank'] },
  'SBIN':       { companyName: 'State Bank of India',    aliases: ['SBI'] },
  'AXISBANK':   { companyName: 'Axis Bank',              aliases: ['Axis Bank'] },
  'BAJFINANCE': { companyName: 'Bajaj Finance',          aliases: ['Bajaj Finance'] },
  'WIPRO':      { companyName: 'Wipro',                  aliases: ['Wipro'] },
  'HCLTECH':    { companyName: 'HCL Technologies',       aliases: ['HCL Tech'] },
  'TECHM':      { companyName: 'Tech Mahindra',          aliases: ['Tech Mahindra'] },
  'TATAMOTORS': { companyName: 'Tata Motors',            aliases: ['Tata Motors'] },
  'TATASTEEL':  { companyName: 'Tata Steel',             aliases: ['Tata Steel'] },
  'LT':         { companyName: 'Larsen Toubro',          aliases: ['L&T', 'Larsen Toubro'] },
  'MARUTI':     { companyName: 'Maruti Suzuki',          aliases: ['Maruti Suzuki'] },
  'SUNPHARMA':  { companyName: 'Sun Pharmaceutical',     aliases: ['Sun Pharma'] },
  'DRREDDY':    { companyName: 'Dr Reddys Laboratories', aliases: ['Dr Reddy'] },
  'CIPLA':      { companyName: 'Cipla',                  aliases: ['Cipla'] },
  'TITAN':      { companyName: 'Titan Company',          aliases: ['Titan'] },
  'ASIANPAINT': { companyName: 'Asian Paints',           aliases: ['Asian Paints'] },
  'ULTRACEMCO': { companyName: 'UltraTech Cement',       aliases: ['UltraTech'] },
  'HINDALCO':   { companyName: 'Hindalco Industries',    aliases: ['Hindalco'] },
  'COALINDIA':  { companyName: 'Coal India',             aliases: ['Coal India'] },
  'ONGC':       { companyName: 'ONGC',                   aliases: ['Oil Natural Gas'] },
  'NTPC':       { companyName: 'NTPC',                   aliases: ['NTPC'] },
  'POWERGRID':  { companyName: 'Power Grid Corporation', aliases: ['Power Grid'] },
  'SOLARINDS':  { companyName: 'Solar Industries India', aliases: ['Solar Industries'] },
  'ADANIENT':   { companyName: 'Adani Enterprises',      aliases: ['Adani'] },
  'ADANIPORTS': { companyName: 'Adani Ports',            aliases: ['Adani Ports'] },
  'MM':         { companyName: 'Mahindra Mahindra',      aliases: ['M&M', 'Mahindra'] },
};

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger    = new Logger(MarketDataService.name);
  private cookies            = '';
  private crumb              = '';
  private credentialsFetched = false;

  // Read API key using BOTH ConfigService and direct process.env as fallback.
  // ConfigService can miss values if the .env file isn't loaded before the
  // module initialises. process.env is always reliable after dotenv runs.
  private get newsApiKey(): string {
    return (
      this.config.get<string>('NEWS_API_KEY') ??
      process.env['NEWS_API_KEY'] ??
      ''
    ).trim();
  }

  private readonly xmlParser = new XMLParser({
    ignoreAttributes:    false,
    attributeNamePrefix: '@_',
    isArray:             (name) => name === 'item',
  });

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.refreshCredentials();

    // ── Startup diagnostic — shows immediately in logs ──────────────────
    // Tells you exactly whether the key was found and which source found it
    const keyViaConfig  = this.config.get<string>('NEWS_API_KEY');
    const keyViaEnv     = process.env['NEWS_API_KEY'];
    const resolvedKey   = this.newsApiKey;

    if (resolvedKey) {
      this.logger.log(
        `[News] NewsAPI key loaded ✅ — ` +
        `ConfigService: ${keyViaConfig ? '✅' : '❌'}, ` +
        `process.env: ${keyViaEnv ? '✅' : '❌'}, ` +
        `key prefix: ${resolvedKey.slice(0, 8)}...`
      );
    } else {
      this.logger.warn(
        `[News] NEWS_API_KEY not found ❌ — ` +
        `ConfigService: ${keyViaConfig ?? 'undefined'}, ` +
        `process.env: ${keyViaEnv ?? 'undefined'}. ` +
        `Add NEWS_API_KEY=yourkey to .env and restart.`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // safeSymbolPath — do NOT encodeURIComponent symbols in URL paths.
  // encodeURIComponent('M&M.NS') → 'M%26M.NS' → Yahoo reads & as query
  // separator → 404. Yahoo handles M&M.NS natively in path segments.
  // ─────────────────────────────────────────────────────────────────────────
  private safeSymbolPath(yahooSymbol: string): string {
    return yahooSymbol.replace(/ /g, '+');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // refreshCredentials
  // ─────────────────────────────────────────────────────────────────────────
  private async refreshCredentials(): Promise<void> {
    try {
      this.logger.log('Fetching Yahoo Finance session cookies...');

      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': BROWSER_UA },
        redirect: 'follow',
      });

      const rawCookies = cookieRes.headers.getSetCookie?.() ??
        [cookieRes.headers.get('set-cookie') ?? ''];

      this.cookies = rawCookies
        .map((c: string) => c.split(';')[0])
        .filter(Boolean)
        .join('; ');

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
        throw new Error(`Unexpected crumb: ${crumb.slice(0, 50)}`);
      }

      this.crumb              = crumb;
      this.credentialsFetched = true;
      this.logger.log(`✅ Yahoo credentials ready. Crumb: ${this.crumb}`);

    } catch (err: any) {
      this.logger.error(`Failed to fetch Yahoo credentials: ${err.message}`);
      this.credentialsFetched = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchYahooQuotes — raw batch quote fetch, symbols passed un-encoded
  // ─────────────────────────────────────────────────────────────────────────
  private async fetchYahooQuotes(symbols: string[]): Promise<any[]> {
    if (!this.credentialsFetched) await this.refreshCredentials();

    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${symbols.join(',')}` +
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

    if (res.status === 401 || res.status === 403) {
      this.logger.warn('Yahoo credentials expired, refreshing...');
      await this.refreshCredentials();
      return this.fetchYahooQuotes(symbols);
    }

    if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}`);

    const text = await res.text();
    if (text.startsWith('Too Many')) throw new Error('Too Many Requests');

    const data = JSON.parse(text);
    return data?.quoteResponse?.result ?? [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLiveQuotes
  // ─────────────────────────────────────────────────────────────────────────
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
          this.logger.log(
            `Chunk ${i + 1}/${chunks.length}: fetched ${quotes.length} quotes`
          );
          break;
        } catch (err: any) {
          const isRateLimit = err.message?.includes('Too Many');
          if (attempt < MAX_RETRIES) {
            const delay = isRateLimit ? 5000 * attempt : 1000 * attempt;
            this.logger.warn(
              `Chunk ${i + 1} attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms...`
            );
            await this.sleep(delay);
          } else {
            this.logger.error(
              `Chunk ${i + 1} failed after ${MAX_RETRIES} attempts: ${err.message}`
            );
          }
        }
      }

      if (i < chunks.length - 1) await this.sleep(CHUNK_DELAY);
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchSingleQuote
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // fetchDetail
  // ─────────────────────────────────────────────────────────────────────────
  async fetchDetail(yahooSymbol: string): Promise<any> {
    try {
      if (!this.credentialsFetched) await this.refreshCredentials();

      const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${this.safeSymbolPath(yahooSymbol)}` +
        `?modules=summaryDetail,defaultKeyStatistics,assetProfile,financialData` +
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

      if (!res.ok) {
        this.logger.warn(`fetchDetail HTTP ${res.status} for ${yahooSymbol}`);
        return null;
      }

      const data   = await res.json();
      const result = data?.quoteSummary?.result?.[0];
      if (!result)  return null;

      const sd = result.summaryDetail        ?? {};
      const ks = result.defaultKeyStatistics ?? {};
      const ap = result.assetProfile         ?? {};
      const fd = result.financialData        ?? {};

      return {
        marketCap:        sd.marketCap?.raw,
        peRatio:          sd.trailingPE?.raw,
        pbRatio:          ks.priceToBook?.raw,
        dividendYield:    sd.dividendYield?.raw ? sd.dividendYield.raw * 100 : undefined,
        fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh?.raw,
        fiftyTwoWeekLow:  sd.fiftyTwoWeekLow?.raw,
        eps:              ks.trailingEps?.raw,
        bookValue:        ks.bookValue?.raw,
        beta:             sd.beta?.raw,
        roe:              fd.returnOnEquity?.raw ? fd.returnOnEquity.raw * 100 : undefined,
        debtToEquity:     fd.debtToEquity?.raw,
        faceValue:        undefined,
        description:      ap.longBusinessSummary,
        website:          ap.website,
        employees:        ap.fullTimeEmployees,
        sector:           ap.sector,
        industry:         ap.industry,
      };
    } catch (err: any) {
      this.logger.warn(`fetchDetail failed for ${yahooSymbol}: ${err.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchNews — RSS first, NewsAPI fallback
  // ─────────────────────────────────────────────────────────────────────────
  async fetchNews(yahooSymbol: string): Promise<NewsItem[]> {

    // ── Step 1: Yahoo Finance RSS ─────────────────────────────────────────
    const symbolsToTry = [yahooSymbol];
    if (yahooSymbol.endsWith('.NS')) {
      symbolsToTry.push(yahooSymbol.replace('.NS', '.BO'));
    }

    for (const symbol of symbolsToTry) {
      try {
        const items = await this.fetchRSSFeed(symbol);
        if (items.length >= 1) {
          this.logger.log(`[News] RSS: ${items.length} articles for ${symbol}`);
          return items;
        }
      } catch (err: any) {
        this.logger.warn(`[News] RSS failed for ${symbol}: ${err.message}`);
      }
    }

    // ── Step 2: NewsAPI fallback ──────────────────────────────────────────
    this.logger.log(`[News] RSS empty for ${yahooSymbol} — falling back to NewsAPI`);
    return this.fetchNewsAPI(yahooSymbol);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchRSSFeed
  // ─────────────────────────────────────────────────────────────────────────
  private async fetchRSSFeed(yahooSymbol: string): Promise<NewsItem[]> {
    const rssUrl =
      `https://finance.yahoo.com/rss/headline?s=${this.safeSymbolPath(yahooSymbol)}`;

    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept':     'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);

    const xml = await res.text();

    if (!xml.trim().startsWith('<?xml') && !xml.trim().startsWith('<rss')) {
      throw new Error(`Non-XML response for ${yahooSymbol}`);
    }

    const parsed = this.xmlParser.parse(xml);
    const items: any[] = parsed?.rss?.channel?.item ?? [];
    if (!items.length) return [];

    return items.slice(0, 10).map((item: any) => {
      const pubDate  = item.pubDate ? new Date(item.pubDate) : null;
      const unixSecs = pubDate ? Math.floor(pubDate.getTime() / 1000) : 0;
      const publisher =
        item.source?.['#text'] ?? item['dc:creator'] ?? 'Yahoo Finance';

      return {
        title:     item.title ?? '',
        publisher,
        link:      item.link ?? item.guid ?? '#',
        timeAgo:   this.timeAgo(unixSecs),
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchNewsAPI
  // ─────────────────────────────────────────────────────────────────────────
  private async fetchNewsAPI(yahooSymbol: string): Promise<NewsItem[]> {
    const apiKey = this.newsApiKey;   // uses getter — ConfigService + process.env fallback

    if (!apiKey) {
      this.logger.warn(
        `[News] NEWS_API_KEY missing — add it to .env and restart the server`
      );
      return [];
    }

    try {
      // Clean ticker: M&M.NS → MM, RELIANCE.NS → RELIANCE
      const ticker = yahooSymbol
        .replace(/\.(NS|BO)$/i, '')
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase();

      const meta  = STOCK_META[ticker];
      const query = meta
        ? [meta.companyName, ...meta.aliases].map(t => `"${t}"`).join(' OR ')
        : `${ticker} NSE stock India`;

      const domains = [
        'economictimes.indiatimes.com',
        'moneycontrol.com',
        'livemint.com',
        'business-standard.com',
        'financialexpress.com',
        'ndtvprofit.com',
        'reuters.com',
        'thehindubusinessline.com',
        'cnbctv18.com',
        'zeebiz.com',
      ].join(',');

      const url = new URL('https://newsapi.org/v2/everything');
      url.searchParams.set('q',        query);
      url.searchParams.set('domains',  domains);
      url.searchParams.set('language', 'en');
      url.searchParams.set('sortBy',   'publishedAt');
      url.searchParams.set('pageSize', '10');
      url.searchParams.set('apiKey',   apiKey);

      this.logger.log(`[News] NewsAPI query for ${ticker}: ${query}`);

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': BROWSER_UA },
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`[News] NewsAPI HTTP ${res.status}: ${body.slice(0, 150)}`);
        return [];
      }

      const data     = await res.json();
      const articles = (data?.articles ?? []) as any[];

      this.logger.log(`[News] NewsAPI returned ${articles.length} articles for ${ticker}`);

      return articles
        .filter((a: any) => a.title && a.title !== '[Removed]' && a.url)
        .slice(0, 10)
        .map((a: any) => ({
          title:     a.title,
          publisher: a.source?.name ?? 'NewsAPI',
          link:      a.url,
          timeAgo:   this.timeAgo(
            a.publishedAt
              ? Math.floor(new Date(a.publishedAt).getTime() / 1000)
              : 0
          ),
        }));

    } catch (err: any) {
      this.logger.warn(`[News] NewsAPI failed for ${yahooSymbol}: ${err.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getHistoricalData
  // ─────────────────────────────────────────────────────────────────────────
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
        `https://query1.finance.yahoo.com/v8/finance/chart/${this.safeSymbolPath(yahooSymbol)}` +
        `?period1=${p1}&period2=${p2}&interval=${interval}` +
        `&crumb=${encodeURIComponent(this.crumb)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept':     'application/json',
          'Cookie':     this.cookies,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data  = await res.json();
      const chart = data?.chart?.result?.[0];
      if (!chart) return [];

      const timestamps = chart.timestamp              as number[];
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

  // ─────────────────────────────────────────────────────────────────────────
  // searchStock
  // ─────────────────────────────────────────────────────────────────────────
  async searchStock(query: string): Promise<any[]> {
    try {
      if (!this.credentialsFetched) await this.refreshCredentials();

      const url =
        `https://query1.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(query)}&newsCount=0` +
        `&crumb=${encodeURIComponent(this.crumb)}`;

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

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
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

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeAgo(unixSeconds: number): string {
    if (!unixSeconds) return '';
    const diffMs   = Date.now() - unixSeconds * 1000;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60)   return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }
}