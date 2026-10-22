import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from './connect';
import { saveFile, storedFileExists } from './gridfs';
import { contentTypeFor, uploadRoot } from '../middleware/upload';

/**
 * `npm run migrate:uploads`
 *
 * Copies files that still sit in the local `uploads/` folder into MongoDB
 * GridFS, so links already stored in the database keep working after a deploy
 * or from another machine. Safe to run more than once — files already in
 * GridFS are skipped.
 */
const LEGACY_UPLOAD_DIR = uploadRoot;

/** `/uploads/abc.png` -> `abc.png`; anything else -> null. */
function storedName(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  return path.basename(url);
}

async function main(): Promise<void> {
  if (!fs.existsSync(LEGACY_UPLOAD_DIR)) {
    console.log('No "uploads" folder here — nothing to migrate.');
    return;
  }

  await connectDatabase();

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('The database connection is not ready.');
  }

  // Only files the database still points at are worth copying.
  const names = new Set<string>();

  for (const user of await db.collection('users').find({}).toArray()) {
    const name = storedName(user.profilePhotoUrl);
    if (name) names.add(name);
  }

  for (const requirement of await db.collection('requirements').find({}).toArray()) {
    const name = storedName(requirement.fileUrl);
    if (name) names.add(name);
  }

  console.log(`${names.size} file(s) referenced by the database.`);

  let copied = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const name of [...names].sort()) {
    if (await storedFileExists(name)) {
      skipped += 1;
      continue;
    }

    const source = path.join(LEGACY_UPLOAD_DIR, name);
    if (!fs.existsSync(source)) {
      missing.push(name);
      continue;
    }

    await saveFile(name, fs.readFileSync(source), contentTypeFor(name));
    copied += 1;
    console.log(`  copied ${name} (${contentTypeFor(name)})`);
  }

  console.log(`\nDone: ${copied} copied, ${skipped} already stored, ${missing.length} missing.`);

  if (missing.length > 0) {
    console.log('These are referenced but not in the uploads folder; their links will 404:');
    for (const name of missing) console.log(`  ${name}`);
  }

  await disconnectDatabase();
}

main().catch((error) => {
  console.error('❌ Upload migration failed:', error);
  process.exit(1);
});
