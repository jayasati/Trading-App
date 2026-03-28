import { Injectable } from '@nestjs/common';

@Injectable()
export class PriceProcessorService {
  process(quote: any) {
    return {
      price: quote.price,
      change: quote.price - quote.open,
    };
  }
}