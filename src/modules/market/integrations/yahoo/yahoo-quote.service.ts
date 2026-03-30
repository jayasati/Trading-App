import { Injectable } from "@nestjs/common";
import { YahooAuthService } from "./yahoo-auth.service";

@Injectable()
export class YahooQuoteService {
  constructor(private auth: YahooAuthService) {}

  async fetchQuotes(symbols: string[]) {
    await this.auth.init();

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&crumb=${this.auth.getCrumb()}`;

    const res = await fetch(url, { headers: this.auth.getHeaders() });
    const data = await res.json();

    return data?.quoteResponse?.result ?? [];
  }
}