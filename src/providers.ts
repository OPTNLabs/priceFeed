import type { BaseSymbol, ProviderName, Quote } from './types.js';

type FetchFn = typeof fetch;

type ProviderContext = {
  timeoutMs: number;
  retries: number;
  retryBackoffMs: number;
  fetchFn?: FetchFn;
  keys: {
    cgApiKey?: string;
    coincapApiKey?: string;
    cryptoApisKey?: string;
  };
};

type ProviderResult = {
  quotes: Quote[];
  error?: string;
};

type ProviderFetcher = (
  bases: BaseSymbol[],
  ctx: ProviderContext
) => Promise<ProviderResult>;

const COINGECKO_IDS: Record<BaseSymbol, string> = {
  BTC: 'bitcoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
};

const COINCAP_IDS: Record<BaseSymbol, string> = {
  BTC: 'bitcoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
};

const PROVIDER_COOLDOWN_MS = 5 * 60_000;
const providerCooldownUntil = new Map<ProviderName, number>();

function invert(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[v] = k;
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProviderCooldown(name: ProviderName, now = Date.now()): number | null {
  const until = providerCooldownUntil.get(name);
  if (!until) return null;
  if (until <= now) {
    providerCooldownUntil.delete(name);
    return null;
  }
  return until;
}

function setProviderCooldown(name: ProviderName, now = Date.now()): number {
  const until = now + PROVIDER_COOLDOWN_MS;
  providerCooldownUntil.set(name, until);
  return until;
}

function shouldCooldownProvider(error?: string): boolean {
  if (!error) return false;
  return /429|too many requests|rate limit|fetch failed|timeout|insufficient credits/i.test(error);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: FetchFn
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return body;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetries<T>(
  label: ProviderName,
  fn: () => Promise<T>,
  retries: number,
  retryBackoffMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryBackoffMs * (attempt + 1));
      }
    }
  }

  throw new Error(`${label} failed: ${(lastError as Error)?.message ?? String(lastError)}`);
}

async function fetchFromCoinGecko(
  bases: BaseSymbol[],
  ctx: ProviderContext
): Promise<ProviderResult> {
  if (!bases.length) return { quotes: [] };

  const fetchFn = ctx.fetchFn ?? fetch;
  const ids = bases.map((b) => COINGECKO_IDS[b]).join(',');
  const params = new URLSearchParams({ vs_currency: 'usd', ids });
  const url = `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (ctx.keys.cgApiKey) headers['x-cg-demo-api-key'] = ctx.keys.cgApiKey;

  try {
    const json = await withRetries(
      'coingecko',
      () => fetchJsonWithTimeout(url, { method: 'GET', headers }, ctx.timeoutMs, fetchFn),
      ctx.retries,
      ctx.retryBackoffMs
    );

    const inv = invert(COINGECKO_IDS);
    const now = Date.now();
    const rows = Array.isArray(json) ? json : [];

    const quotes: Quote[] = rows
      .map((row) => {
        const id = String((row as { id?: unknown }).id ?? '');
        const base = inv[id] as BaseSymbol | undefined;
        const price = Number((row as { current_price?: unknown }).current_price);
        if (!base || !Number.isFinite(price)) return null;
        return {
          base,
          quote: 'USD',
          price,
          ts: now,
          source: 'coingecko',
        } as Quote;
      })
      .filter(Boolean) as Quote[];

    return { quotes };
  } catch (error) {
    return { quotes: [], error: (error as Error).message };
  }
}

async function fetchFromCoinCap(
  bases: BaseSymbol[],
  ctx: ProviderContext
): Promise<ProviderResult> {
  if (!bases.length) return { quotes: [] };

  const fetchFn = ctx.fetchFn ?? fetch;
  const ids = bases.map((b) => COINCAP_IDS[b]).join(',');
  const params = new URLSearchParams({ ids });
  const url = `https://api.coincap.io/v2/assets?${params.toString()}`;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (ctx.keys.coincapApiKey) headers.Authorization = `Bearer ${ctx.keys.coincapApiKey}`;

  try {
    const json = await withRetries(
      'coincap',
      () => fetchJsonWithTimeout(url, { method: 'GET', headers }, ctx.timeoutMs, fetchFn),
      ctx.retries,
      ctx.retryBackoffMs
    );

    const rows = Array.isArray((json as { data?: unknown[] }).data)
      ? ((json as { data?: unknown[] }).data as unknown[])
      : [];

    const inv = invert(COINCAP_IDS);
    const now = Date.now();

    const quotes: Quote[] = rows
      .map((row) => {
        const id = String((row as { id?: unknown }).id ?? '');
        const base = inv[id] as BaseSymbol | undefined;
        const price = Number((row as { priceUsd?: unknown }).priceUsd);
        if (!base || !Number.isFinite(price)) return null;
        return {
          base,
          quote: 'USD',
          price,
          ts: now,
          source: 'coincap',
        } as Quote;
      })
      .filter(Boolean) as Quote[];

    return { quotes };
  } catch (error) {
    return { quotes: [], error: (error as Error).message };
  }
}

async function fetchFromCryptoApis(
  bases: BaseSymbol[],
  ctx: ProviderContext
): Promise<ProviderResult> {
  if (!bases.length) return { quotes: [] };

  const fetchFn = ctx.fetchFn ?? fetch;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (ctx.keys.cryptoApisKey) headers['x-api-key'] = ctx.keys.cryptoApisKey;

  const tsSec = Math.floor(Date.now() / 1000);

  try {
    const settled = await Promise.allSettled(
      bases.map((base) =>
        withRetries(
          'cryptoapis',
          async () => {
            const params = new URLSearchParams({ calculationTimestamp: String(tsSec) });
            const url = `https://rest.cryptoapis.io/market-data/exchange-rates/by-symbol/${base}/USD?${params.toString()}`;
            const json = await fetchJsonWithTimeout(url, { method: 'GET', headers }, ctx.timeoutMs, fetchFn);
            const item = (json as { data?: { item?: { rate?: unknown; calculationTimestamp?: unknown } } }).data?.item;

            const price = Number(item?.rate);
            if (!Number.isFinite(price)) return null;

            const rawTs = Number(item?.calculationTimestamp);
            return {
              base,
              quote: 'USD',
              price,
              ts: Number.isFinite(rawTs) ? rawTs * 1000 : Date.now(),
              source: 'cryptoapis',
            } as Quote;
          },
          ctx.retries,
          ctx.retryBackoffMs
        )
      )
    );

    const quotes = settled
      .filter((r): r is PromiseFulfilledResult<Quote | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter(Boolean) as Quote[];

    const failed = settled.filter((r) => r.status === 'rejected').length;
    const error = failed > 0 ? `${failed} symbol request(s) failed` : undefined;
    return { quotes, error };
  } catch (error) {
    return { quotes: [], error: (error as Error).message };
  }
}

export async function fetchQuotesWithFallback(
  bases: BaseSymbol[],
  ctx: ProviderContext
): Promise<{ quotes: Quote[]; providerErrors: Partial<Record<ProviderName, string>> }> {
  const unique = Array.from(new Set(bases));
  const providerErrors: Partial<Record<ProviderName, string>> = {};
  const providers: Array<{ name: ProviderName; fetcher: ProviderFetcher }> = [
    { name: 'coingecko', fetcher: fetchFromCoinGecko },
    { name: 'coincap', fetcher: fetchFromCoinCap },
    { name: 'cryptoapis', fetcher: fetchFromCryptoApis },
  ];

  for (const provider of providers) {
    const cooldownUntil = getProviderCooldown(provider.name);
    if (cooldownUntil) {
      providerErrors[provider.name] = `Skipped after recent upstream failure until ${new Date(cooldownUntil).toISOString()}`;
      continue;
    }

    const result = await provider.fetcher(unique, ctx);
    if (result.error) {
      providerErrors[provider.name] = result.error;
      if (shouldCooldownProvider(result.error)) {
        setProviderCooldown(provider.name);
      }
    }

    if (result.quotes.length > 0) {
      return {
        quotes: result.quotes,
        providerErrors,
      };
    }
  }

  return {
    quotes: [],
    providerErrors,
  };
}

export function resetProviderCooldownsForTest(): void {
  providerCooldownUntil.clear();
}
