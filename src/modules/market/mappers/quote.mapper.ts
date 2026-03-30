export class QuoteMapper {
  static map(q: any) {
    const yahooSymbol = q.symbol as string;
    return {
      symbol:      yahooSymbol.replace('.NS', '').replace('.BO', ''),
      yahooSymbol,                                      // Bug fix: was missing entirely
      price:       Number(q.regularMarketPrice)         || 0,
      open:        Number(q.regularMarketOpen)          || 0,
      high:        Number(q.regularMarketDayHigh)       || 0,
      low:         Number(q.regularMarketDayLow)        || 0,
      close:       Number(q.regularMarketPreviousClose) || 0,
      volume:      Number(q.regularMarketVolume)        || 0,
      change:      Number(q.regularMarketChange)        || 0,
      changePct:   Number(q.regularMarketChangePercent) || 0,
      marketCap:   q.marketCap ? Number(q.marketCap)   : undefined,
    };
  }
}