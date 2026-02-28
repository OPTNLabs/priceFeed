export type BaseSymbol = 'BTC' | 'BCH' | 'ETH';
export type QuoteSymbol = 'USD';
export type ProviderName = 'coingecko' | 'coincap' | 'cryptoapis';

export type Quote = {
  base: BaseSymbol;
  quote: QuoteSymbol;
  price: number;
  ts: number;
  source: ProviderName;
};

export type PriceDatum = {
  price: number;
  ts: number;
  source: ProviderName;
};

export type PricesResponse = {
  quote: QuoteSymbol;
  bases: BaseSymbol[];
  generatedAt: number;
  cache: {
    hit: boolean;
    ttlMs: number;
    expiresAt: number;
  };
  providerErrors: Partial<Record<ProviderName, string>>;
  quotes: Quote[];
  byPair: Record<string, PriceDatum>;
};
