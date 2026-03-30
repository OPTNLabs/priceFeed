import { describe, expect, it } from 'vitest';
import { getRefreshPolicySnapshot } from '../src/refreshPolicy.js';

describe('getRefreshPolicySnapshot', () => {
  it('computes CoinGecko demo refresh interval from monthly budget', () => {
    const snapshot = getRefreshPolicySnapshot('coingecko', 3, 45_000, Date.UTC(2026, 2, 1));

    expect(snapshot.requestCost).toBe(1);
    expect(snapshot.monthlyBudgetIntervalMs).toBe(267_840);
    expect(snapshot.recommendedIntervalMs).toBe(267_840);
  });

  it('computes CoinCap demo refresh interval from monthly budget', () => {
    const snapshot = getRefreshPolicySnapshot('coincap', 3, 45_000, Date.UTC(2026, 2, 1));

    expect(snapshot.requestCost).toBe(1);
    expect(snapshot.monthlyBudgetIntervalMs).toBe(669_600);
    expect(snapshot.recommendedIntervalMs).toBe(669_600);
  });

  it('scales CryptoAPIs refresh interval by requested asset count', () => {
    const snapshot = getRefreshPolicySnapshot('cryptoapis', 3, 45_000, Date.UTC(2026, 2, 1));

    expect(snapshot.requestCost).toBe(810);
    expect(snapshot.monthlyBudgetIntervalMs).toBe(21_695_040);
    expect(snapshot.recommendedIntervalMs).toBe(21_695_040);
  });
});
