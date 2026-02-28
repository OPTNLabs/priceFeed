import { TtlCache } from './cache.js';
import { env } from './env.js';
import { fetchQuotesWithFallback } from './providers.js';
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
      return {
        ...cached.value,
        cache: {
          hit: true,
          ttlMs: env.cacheTtlMs,
          expiresAt: cached.expiresAt,
        },
      };
    }

    const { quotes, providerErrors } = await fetchQuotesWithFallback(bases, {
      timeoutMs: env.providerTimeoutMs,
      retries: env.providerRetries,
      retryBackoffMs: env.retryBackoffMs,
      keys: {
        cgApiKey: env.cgApiKey,
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

    const saved = this.cache.set(cacheKey, payload, env.cacheTtlMs);

    return {
      ...payload,
      cache: {
        hit: false,
        ttlMs: env.cacheTtlMs,
        expiresAt: saved.expiresAt,
      },
    };
  }
}
