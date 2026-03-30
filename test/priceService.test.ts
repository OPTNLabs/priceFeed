import { describe, expect, it, vi } from 'vitest';
import { fetchQuotesWithFallback, resetProviderCooldownsForTest } from '../src/providers.js';
import type { BaseSymbol } from '../src/types.js';

const bases: BaseSymbol[] = ['BTC', 'BCH', 'ETH'];

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchQuotesWithFallback', () => {
  it('returns the first provider that yields any data and stops there', async () => {
    resetProviderCooldownsForTest();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('coingecko')) {
        return okJson([
          { id: 'bitcoin', current_price: 100000 },
        ]);
      }

      if (url.includes('coincap')) {
        return okJson({
          data: [{ id: 'ethereum', priceUsd: '3500' }],
        });
      }

      return okJson({ data: { item: { rate: '0' } } });
    });

    const result = await fetchQuotesWithFallback(bases, {
      timeoutMs: 500,
      retries: 0,
      retryBackoffMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
      keys: {},
    });

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.base).toBe('BTC');
    expect(result.providerErrors.coingecko).toBeUndefined();
    expect(result.providerErrors.freecryptoapi).toBeUndefined();
    expect(result.providerErrors.coincap).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next provider when the current provider fails', async () => {
    resetProviderCooldownsForTest();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('coingecko')) {
        return new Response('bad gateway', { status: 502 });
      }

      if (url.includes('coincap')) {
        return okJson({
          data: [
            { id: 'bitcoin', priceUsd: '100000' },
            { id: 'bitcoin-cash', priceUsd: '500' },
            { id: 'ethereum', priceUsd: '3000' },
          ],
        });
      }

      return okJson({ data: { item: { rate: '0' } } });
    });

    const result = await fetchQuotesWithFallback(bases, {
      timeoutMs: 500,
      retries: 0,
      retryBackoffMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
      keys: {},
    });

    expect(result.quotes).toHaveLength(3);
    expect(result.providerErrors.coingecko).toBeTruthy();
    expect(result.providerErrors.freecryptoapi).toContain('freecryptoapi missing API key');
    expect(result.providerErrors.coincap).toBeUndefined();
  });

  it('skips a provider during cooldown after a rate limit response', async () => {
    resetProviderCooldownsForTest();
    const mockFetch = vi
      .fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('coingecko')) {
          return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
        }

        if (url.includes('coincap')) {
          return okJson({
            data: [{ id: 'bitcoin', priceUsd: '100000' }],
          });
        }

        return okJson({ data: { item: { rate: '0' } } });
      });

    const first = await fetchQuotesWithFallback(['BTC'], {
      timeoutMs: 500,
      retries: 0,
      retryBackoffMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
      keys: {},
    });

    expect(first.providerErrors.coingecko).toContain('429');
    expect(first.providerErrors.freecryptoapi).toContain('freecryptoapi missing API key');
    expect(first.quotes[0]?.source).toBe('coincap');

    mockFetch.mockClear();

    const second = await fetchQuotesWithFallback(['BTC'], {
      timeoutMs: 500,
      retries: 0,
      retryBackoffMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
      keys: {},
    });

    expect(second.providerErrors.coingecko).toContain('Skipped after recent upstream failure');
    expect(second.providerErrors.freecryptoapi).toContain('freecryptoapi missing API key');
    expect(second.quotes[0]?.source).toBe('coincap');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses freecryptoapi before coincap when the key is available', async () => {
    resetProviderCooldownsForTest();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('coingecko')) {
        return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
      }

      if (url.includes('freecryptoapi')) {
        return okJson({
          status: 'success',
          symbols: [
            { symbol: 'BTC', last: '100000' },
            { symbol: 'BCH', last: '500' },
            { symbol: 'ETH', last: '3000' },
          ],
        });
      }

      if (url.includes('coincap')) {
        throw new Error('coincap should not be called');
      }

      return okJson({ data: { item: { rate: '0' } } });
    });

    const result = await fetchQuotesWithFallback(bases, {
      timeoutMs: 500,
      retries: 0,
      retryBackoffMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
      keys: { freeCryptoApiKey: 'test-key' },
    });

    expect(result.providerErrors.coingecko).toContain('429');
    expect(result.providerErrors.freecryptoapi).toBeUndefined();
    expect(result.quotes).toHaveLength(3);
    expect(result.quotes.every((quote) => quote.source === 'freecryptoapi')).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
