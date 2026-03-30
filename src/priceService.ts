import { TtlCache } from './cache.js';
import { env } from './env.js';
import { fetchQuotesWithFallback } from './providers.js';
import { getRecommendedRefreshIntervalMs } from './refreshPolicy.js';
import type { BaseSymbol, PriceDatum, PricesResponse, Quote, QuoteSymbol } from './types.js';

const DEFAULT_BASES: BaseSymbol[] = ['BTC', 'BCH', 'ETH'];
const ALLOWED_BASES = new Set<BaseSymbol>(DEFAULT_BASES);

export class PriceService {
  private readonly cache = new TtlCache<Omit<PricesResponse, 'cache'>>();

  parseBases(value?: string): BaseSymbol[] {
    if (!value) return [...DEFAULT_BASES];

    const parsed = value
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);

    if (!parsed.length) return [...DEFAULT_BASES];

    const out: BaseSymbol[] = [];
    for (const symbol of parsed) {
      if (!ALLOWED_BASES.has(symbol as BaseSymbol)) {
        throw new Error(`Unsupported base symbol: ${symbol}`);
      }
      out.push(symbol as BaseSymbol);
    }

    return Array.from(new Set(out));
  }

  parseQuote(value?: string): QuoteSymbol {
    const quote = (value ?? 'USD').trim().toUpperCase();
    if (quote !== 'USD') {
      throw new Error(`Unsupported quote symbol: ${quote}`);
    }
    return 'USD';
  }

  private buildByPair(quotes: Quote[]): Record<string, PriceDatum> {
    return Object.fromEntries(
      quotes.map((q) => [
        `${q.base}-${q.quote}`,
        { price: q.price, ts: q.ts, source: q.source } as PriceDatum,
      ])
    );
  }

  async getPrices(bases: BaseSymbol[], quote: QuoteSymbol): Promise<PricesResponse> {
    const cacheKey = `${quote}:${[...bases].sort().join(',')}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      const ttlMs = this.getEffectiveTtlMs(cached.value.quotes, bases.length);
      return {
        ...cached.value,
        cache: {
          hit: true,
          ttlMs,
          expiresAt: cached.expiresAt,
        },
      };
    }

    const stale = this.cache.peek(cacheKey);

    const { quotes, providerErrors } = await fetchQuotesWithFallback(bases, {
      timeoutMs: env.providerTimeoutMs,
      retries: env.providerRetries,
      retryBackoffMs: env.retryBackoffMs,
      keys: {
        cgApiKey: env.cgApiKey,
        freeCryptoApiKey: env.freeCryptoApiKey,
        coincapApiKey: env.coincapApiKey,
        cryptoApisKey: env.cryptoApisKey,
      },
    });

    const generatedAt = Date.now();
    const payload: Omit<PricesResponse, 'cache'> = {
      quote,
      bases,
      generatedAt,
      providerErrors,
      quotes,
      byPair: this.buildByPair(quotes),
    };

    if (!quotes.length && stale) {
      const ttlMs = this.getEffectiveTtlMs(stale.value.quotes, bases.length);
      const saved = this.cache.set(cacheKey, stale.value, ttlMs);

      return {
        ...stale.value,
        providerErrors,
        cache: {
          hit: true,
          ttlMs,
          expiresAt: saved.expiresAt,
        },
      };
    }

    const ttlMs = this.getEffectiveTtlMs(quotes, bases.length);
    const saved = this.cache.set(cacheKey, payload, ttlMs);

    return {
      ...payload,
      cache: {
        hit: false,
        ttlMs,
        expiresAt: saved.expiresAt,
      },
    };
  }

  private getEffectiveTtlMs(quotes: Quote[], baseCount: number): number {
    const provider = quotes[0]?.source;
    if (!provider) return env.cacheTtlMs;
    return getRecommendedRefreshIntervalMs(provider, baseCount, env.cacheTtlMs);
  }
}
