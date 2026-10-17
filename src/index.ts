import { createApp } from './app';
import { env } from './config/env';
import { connectWithRetry, disconnectDatabase } from './db/connect';
import { seedIfEmpty } from './db/seed';

async function main(): Promise<void> {
  // Keep retrying: Atlas refuses connections from IPs that are not on the
  // cluster's access list, and a home IP can change at any moment.
  await connectWithRetry();

  if (env.seedOnStart) {
    await seedIfEmpty();
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`🚀 liceoscholar-be listening on http://localhost:${env.port}`);
    console.log(`   CORS origins: ${env.corsOrigins.join(', ') || '(all)'}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received — shutting down gracefully.`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('\n❌ Failed to start the server:', error instanceof Error ? error.message : error);
  console.error(
    '\nIf this mentions "IP that isn\'t whitelisted", open Atlas -> Network Access\n'
    + 'and add your current public IP (or 0.0.0.0/0 to allow any address).\n'
  );
  process.exit(1);
});
