import { env } from './env.js';
import { buildServer } from './server.js';

async function start(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: env.port, host: env.host });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

void start();
