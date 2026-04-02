import { calculateIntradayMargin, getIntradayLeverage } from './intraday-margin';

describe('intraday-margin', () => {
  const original = process.env.INTRADAY_LEVERAGE;

  afterEach(() => {
    if (original === undefined) delete process.env.INTRADAY_LEVERAGE;
    else process.env.INTRADAY_LEVERAGE = original;
  });

  it('uses default leverage 5x when env is unset', () => {
    delete process.env.INTRADAY_LEVERAGE;
    expect(getIntradayLeverage()).toBe(5);
    expect(calculateIntradayMargin(100, 10).toNumber()).toBe(200);
  });

  it('uses configured leverage from env', () => {
    process.env.INTRADAY_LEVERAGE = '10';
    expect(getIntradayLeverage()).toBe(10);
    expect(calculateIntradayMargin(100, 10).toNumber()).toBe(100);
  });
});
