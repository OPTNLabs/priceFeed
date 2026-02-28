import { describe, expect, it, vi } from 'vitest';
import { fetchQuotesWithFallback } from '../src/providers.js';
import type { BaseSymbol } from '../src/types.js';

const bases: BaseSymbol[] = ['BTC', 'BCH', 'ETH'];

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchQuotesWithFallback', () => {
  it('fills missing symbols across provider chain', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('coingecko')) {
        return okJson([
          { id: 'bitcoin', current_price: 100000 },
          { id: 'bitcoin-cash', current_price: 450 },
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

    expect(result.quotes).toHaveLength(3);
    expect(result.providerErrors.coingecko).toBeUndefined();
    expect(result.providerErrors.coincap).toBeUndefined();
  });

  it('records provider errors and continues', async () => {
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
  });
});
