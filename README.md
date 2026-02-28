# OPTN PriceFeed Server

Standalone backend price server for OPTNWallet. It mirrors the wallet's current logic server-side so API keys are never exposed in the app.

## Wallet Logic Mirrored

- Bases: `BTC`, `BCH`, `ETH`
- Quote: `USD`
- Provider priority:
  1. CoinGecko
  2. CoinCap (missing symbols only)
  3. CryptoAPIs (remaining symbols only)
- Per-provider timeout and retry
- Partial-fill fallback (not all-or-nothing)

## Endpoints

### `GET /v1/prices?bases=BTC,BCH,ETH&quote=USD`

Query params:

- `bases` (optional, CSV): allowed values `BTC,BCH,ETH`
- `quote` (optional): only `USD`

Response shape:

```json
{
  "quote": "USD",
  "bases": ["BTC", "BCH", "ETH"],
  "generatedAt": 1740787200000,
  "cache": {
    "hit": false,
    "ttlMs": 45000,
    "expiresAt": 1740787245000
  },
  "providerErrors": {},
  "quotes": [
    {
      "base": "BTC",
      "quote": "USD",
      "price": 100123.45,
      "ts": 1740787200000,
      "source": "coingecko"
    }
  ],
  "byPair": {
    "BTC-USD": {
      "price": 100123.45,
      "ts": 1740787200000,
      "source": "coingecko"
    }
  }
}
```

`byPair` is directly compatible with wallet Redux `upsertPrices` payload shape.

### `GET /health`

Returns process uptime, active cache/retry config, CORS config, and whether provider keys are loaded.

## Environment

Copy `.env.example` to `.env`.

```bash
PORT=8080
HOST=0.0.0.0
LOG_LEVEL=info
TRUST_PROXY=true
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://wallet.example.com
PRICE_CACHE_TTL_MS=45000
PROVIDER_TIMEOUT_MS=8000
PROVIDER_RETRIES=1
RETRY_BACKOFF_MS=250
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
CG_API_KEY=xxxxx
COINCAP_API_KEY=xxxxx
CRYPTOAPIS_KEY=xxxxx
```

## Local Run

```bash
npm install
npm run dev
```

```bash
npm run build
npm test
```

## Docker (Local)

```bash
docker compose up -d --build
curl http://127.0.0.1:8080/health
```

## Docker on Remote VMs

### Option A: Registry push/pull (recommended)

On build machine:

```bash
docker build -t <registry>/optn-pricefeed:1.0.0 .
docker push <registry>/optn-pricefeed:1.0.0
```

On each VM:

```bash
docker pull <registry>/optn-pricefeed:1.0.0
cp .env.example .env
# edit .env with real keys + VM's allowed frontend origins
docker run -d --name optn-pricefeed --restart unless-stopped --env-file .env -p 8080:8080 <registry>/optn-pricefeed:1.0.0
```

### Option B: No registry (air-gapped transfer)

On build machine:

```bash
docker build -t optn-pricefeed:1.0.0 .
docker save optn-pricefeed:1.0.0 | gzip > optn-pricefeed-1.0.0.tar.gz
```

Copy tarball to VM (scp/rsync/USB), then on VM:

```bash
gunzip -c optn-pricefeed-1.0.0.tar.gz | docker load
cp .env.example .env
# edit .env
docker run -d --name optn-pricefeed --restart unless-stopped --env-file .env -p 8080:8080 optn-pricefeed:1.0.0
```

## VM Network Notes

- Open inbound TCP `8080` (or place behind Nginx/Caddy and expose `443`).
- Set `CORS_ALLOWED_ORIGINS` to exact wallet frontend origins.
- For public internet exposure, put TLS/reverse proxy in front and keep `RATE_LIMIT_MAX` conservative.
