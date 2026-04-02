const DEFAULT_ORIGIN = 'http://localhost:3001';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const value = raw ?? DEFAULT_ORIGIN;
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

export function getAllowedHttpOrigins(): string[] {
  return parseAllowedOrigins(process.env.CORS_ORIGINS);
}

export function getAllowedWsOrigins(): string[] {
  return parseAllowedOrigins(process.env.WS_CORS_ORIGINS ?? process.env.CORS_ORIGINS);
}
