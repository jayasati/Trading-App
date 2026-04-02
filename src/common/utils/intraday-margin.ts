import { Prisma } from '../../generated/prisma/client';

const DEFAULT_INTRADAY_LEVERAGE = 5;

export function getIntradayLeverage(): number {
  const raw = process.env.INTRADAY_LEVERAGE;
  const parsed = raw ? Number(raw) : DEFAULT_INTRADAY_LEVERAGE;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTRADAY_LEVERAGE;
  }

  return parsed;
}

export function getIntradayMarginRatio(): number {
  return 1 / getIntradayLeverage();
}

export function calculateIntradayMargin(price: number, quantity: number): Prisma.Decimal {
  const notional = new Prisma.Decimal(price).mul(quantity);
  return notional.mul(getIntradayMarginRatio());
}
