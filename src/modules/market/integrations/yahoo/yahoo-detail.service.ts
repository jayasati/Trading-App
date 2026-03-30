import { Injectable, Logger } from '@nestjs/common';
import { YahooAuthService } from './yahoo-auth.service';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

@Injectable()
export class YahooDetailService {
  private readonly logger = new Logger(YahooDetailService.name);

  constructor(private readonly auth: YahooAuthService) {}

  // Bug fix: this method existed in the old monolithic MarketDataService
  // but was never implemented here when the service was split.
  async fetchDetail(yahooSymbol: string): Promise<any> {
    try {
      await this.auth.init();

      const safeSymbol = yahooSymbol.replace(/ /g, '+');
      const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${safeSymbol}` +
        `?modules=summaryDetail,defaultKeyStatistics,assetProfile,financialData` +
        `&crumb=${encodeURIComponent(this.auth.getCrumb())}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent':      BROWSER_UA,
          'Accept':          'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin':          'https://finance.yahoo.com',
          'Referer':         'https://finance.yahoo.com/',
          'Cookie':          this.auth.getCookies(),
        },
      });

      if (!res.ok) {
        this.logger.warn(`fetchDetail HTTP ${res.status} for ${yahooSymbol}`);
        return null;
      }

      const data   = await res.json();
      const result = data?.quoteSummary?.result?.[0];
      if (!result) return null;

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
}