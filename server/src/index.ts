import { buildApp } from './app.js';
import { config, assertProdConfig } from './config.js';

// Entry point: build the app and start listening. Cloud Run injects PORT.

async function main(): Promise<void> {
  assertProdConfig();
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
