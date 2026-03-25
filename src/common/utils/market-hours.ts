// src/common/utils/market-hours.ts
// Single source of truth for market hours across backend services.
// Import this instead of duplicating the logic in each service.

/**
 * NSE/BSE market hours: Mon–Fri 09:15 – 15:30 IST (UTC+5:30)
 */
export function isMarketOpen(): boolean {
  const now  = new Date();
  const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day  = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  //                   Mon–Fri      09:15          15:30
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

/** Pre-open session: 9:00–9:15 AM IST */
export function isPreOpen(): boolean {
  const now  = new Date();
  const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day  = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 540 && mins < 555;
}

/** Auto square-off window: 3:20–3:30 PM IST */
export function isSquareOffWindow(): boolean {
  const now  = new Date();
  const ist  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day  = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 920 && mins <= 930;
}