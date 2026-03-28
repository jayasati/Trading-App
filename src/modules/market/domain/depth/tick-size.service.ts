import { Injectable } from '@nestjs/common';

@Injectable()
export class TickSizeService {
  get(price: number): number {
    if (price < 10) return 0.01;
    if (price < 100) return 0.1;
    if (price < 1000) return 0.5;
    return 1;
  }
}