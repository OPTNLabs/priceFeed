import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env.js';
import { PriceService } from './priceService.js';
import { getClientKey, InMemoryRateLimiter, sendRateLimitHeaders } from './rateLimit.js';
import { getRefreshPolicySnapshot } from './refreshPolicy.js';

export async function buildServer() {
  const app = Fastify({
    logger: { level: env.logLevel },
    trustProxy: env.trustProxy,
  });
  const priceService = new PriceService();
  const limiter = new InMemoryRateLimiter(env.rateLimitMax, env.rateLimitWindowMs);

  const allowAllOrigins = env.corsAllowedOrigins.includes('*');
  const allowedSet = new Set(env.corsAllowedOrigins);

  await app.register(cors, {
    credentials: false,
    methods: ['GET', 'OPTIONS'],
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      if (allowAllOrigins || allowedSet.has(origin)) {
        cb(null, true);
        return;
      }

      cb(new Error('Origin not allowed'), false);
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    const key = getClientKey(request);
    const result = limiter.check(key);

    sendRateLimitHeaders(reply, result);

    if (!result.allowed) {
      return reply.code(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
      });
    }
  });

  app.get('/health', async () => {
    const defaultAssetCount = 3;
    return {
      status: 'ok',
      service: 'optn-pricefeed-server',
      now: Date.now(),
      uptimeSec: process.uptime(),
      cacheTtlMs: env.cacheTtlMs,
      providerTimeoutMs: env.providerTimeoutMs,
      providerRetries: env.providerRetries,
      corsAllowedOrigins: env.corsAllowedOrigins,
      keys: {
        coingecko: Boolean(env.cgApiKey),
        coincap: Boolean(env.coincapApiKey),
        cryptoapis: Boolean(env.cryptoApisKey),
      },
      refreshPolicy: {
        cacheTtlFloorMs: env.cacheTtlMs,
        defaultAssetCount,
        providers: {
          coingecko: getRefreshPolicySnapshot('coingecko', defaultAssetCount, env.cacheTtlMs),
          coincap: getRefreshPolicySnapshot('coincap', defaultAssetCount, env.cacheTtlMs),
          cryptoapis: getRefreshPolicySnapshot('cryptoapis', defaultAssetCount, env.cacheTtlMs),
        },
      },
    };
  });

  app.get('/v1/prices', async (request, reply) => {
    try {
      const query = request.query as { bases?: string; quote?: string };
      const bases = priceService.parseBases(query.bases);
      const quote = priceService.parseQuote(query.quote);
      const payload = await priceService.getPrices(bases, quote);

      if (!payload.quotes.length) {
        reply.code(503);
      }

      return payload;
    } catch (error) {
      request.log.error({ err: error }, 'Price request failed');
      return reply.code(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  return app;
}
