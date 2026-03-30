export type Quote = {
  symbol: string;        // clean symbol 
  yahooSymbol: string;   
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change?: number;
  changePct?: number;
  marketCap?: number;
};