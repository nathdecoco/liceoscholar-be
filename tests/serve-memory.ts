/**
 * Local development server backed by a MongoDB instance that runs on this
 * machine instead of Atlas.
 *
 *   npx tsx tests/serve-memory.ts
 *
 * Data is written to .mongo-data/ and survives restarts, so accounts created
 * while testing are still there tomorrow. Delete that folder to start clean.
 */
import fs from 'node:fs';
import path from 'node:path';

import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'liceoscholar-local-memory-secret';
process.env.SEED_ON_START = 'true';

const DATA_DIR = process.env.LOCAL_MONGO_DATA_DIR ?? path.join(process.cwd(), '.mongo-data');

async function main(): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: {
      dbPath: DATA_DIR,
      storageEngine: 'wiredTiger'
    }
  });
  console.log(`💾 Local MongoDB started (data kept in ${DATA_DIR})`);

  const { connectDatabase } = await import('../src/db/connect');
  await connectDatabase(mongod.getUri());

  const { seedIfEmpty } = await import('../src/db/seed');
  await seedIfEmpty();

  const { createApp } = await import('../src/app');
  const { env } = await import('../src/config/env');

  const server = createApp().listen(env.port, () => {
    console.log(`🚀 liceoscholar-be (local database) listening on http://localhost:${env.port}`);
  });

  // Close connections before stopping MongoDB so anything just written is
  // flushed to disk. Without this the last write or two can be lost.
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n👋 Shutting down — saving data…');

    server.close();
    const { disconnectDatabase } = await import('../src/db/connect');
    await disconnectDatabase();
    await mongod.stop();

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Failed to start the local database server:', error);
  process.exit(1);
});