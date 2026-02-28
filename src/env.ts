import dotenv from 'dotenv';

dotenv.config();

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function strEnv(name: string, fallback = ''): string {
  const raw = process.env[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function csvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export const env = {
  port: intEnv('PORT', 8080),
  host: strEnv('HOST', '0.0.0.0'),
  logLevel: strEnv('LOG_LEVEL', 'info'),
  trustProxy: boolEnv('TRUST_PROXY', true),
  corsAllowedOrigins: csvEnv('CORS_ALLOWED_ORIGINS'),
  cacheTtlMs: intEnv('PRICE_CACHE_TTL_MS', 45_000),
  providerTimeoutMs: intEnv('PROVIDER_TIMEOUT_MS', 8_000),
  providerRetries: intEnv('PROVIDER_RETRIES', 1),
  retryBackoffMs: intEnv('RETRY_BACKOFF_MS', 250),
  rateLimitWindowMs: intEnv('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: intEnv('RATE_LIMIT_MAX', 120),
  cgApiKey: strEnv('CG_API_KEY'),
  coincapApiKey: strEnv('COINCAP_API_KEY'),
  cryptoApisKey: strEnv('CRYPTOAPIS_KEY'),
};
