import { connectDatabase, disconnectDatabase } from './connect';
import { runSeed } from './seed';

/** `npm run seed` — force-seeds the demo data. */
async function main(): Promise<void> {
  await connectDatabase();
  await runSeed();
  await disconnectDatabase();
  console.log('Seed complete.');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
