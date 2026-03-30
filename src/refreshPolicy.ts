import type { ProviderName } from './types.js';

type ProviderBudget = {
  monthlyCredits: number;
  perMinuteLimit: number;
  costForRequest: (assetCount: number) => number;
};

export type RefreshPolicySnapshot = {
  provider: ProviderName;
  monthlyCredits: number;
  perMinuteLimit: number;
  requestCost: number;
  monthDurationMs: number;
  monthlyBudgetIntervalMs: number;
  perMinuteIntervalMs: number;
  recommendedIntervalMs: number;
};

const FREE_TIER_BUDGETS: Record<ProviderName, ProviderBudget> = {
  coingecko: {
    monthlyCredits: 10_000,
    perMinuteLimit: 30,
    costForRequest: () => 1,
  },
  coincap: {
    monthlyCredits: 4_000,
    perMinuteLimit: 4,
    costForRequest: () => 1,
  },
  cryptoapis: {
    monthlyCredits: 100_000,
    perMinuteLimit: 100,
    costForRequest: (assetCount) => 270 * Math.max(assetCount, 1),
  },
};

function getMonthDurationMs(now = Date.now()): number {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return end - start;
}

export function getRefreshPolicySnapshot(
  provider: ProviderName,
  assetCount: number,
  ttlFloorMs = 0,
  now = Date.now()
): RefreshPolicySnapshot {
  const budget = FREE_TIER_BUDGETS[provider];
  const requestCost = budget.costForRequest(assetCount);
  const monthDurationMs = getMonthDurationMs(now);
  const monthlyBudgetIntervalMs = Math.ceil((monthDurationMs * requestCost) / budget.monthlyCredits);
  const perMinuteIntervalMs = Math.ceil(60_000 / budget.perMinuteLimit);

  return {
    provider,
    monthlyCredits: budget.monthlyCredits,
    perMinuteLimit: budget.perMinuteLimit,
    requestCost,
    monthDurationMs,
    monthlyBudgetIntervalMs,
    perMinuteIntervalMs,
    recommendedIntervalMs: Math.max(ttlFloorMs, monthlyBudgetIntervalMs, perMinuteIntervalMs),
  };
}

export function getRecommendedRefreshIntervalMs(
  provider: ProviderName,
  assetCount: number,
  ttlFloorMs = 0,
  now = Date.now()
): number {
  return getRefreshPolicySnapshot(provider, assetCount, ttlFloorMs, now).recommendedIntervalMs;
}
