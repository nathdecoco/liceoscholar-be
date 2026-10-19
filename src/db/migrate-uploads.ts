import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from './connect';
import { saveFile, storedFileExists } from './gridfs';

/**
 * `npm run migrate:uploads`
 *
 * Copies the files that used to sit in the local `uploads/` folder into
 * MongoDB GridFS, so links already stored in the database keep working after
 * deploy. Safe to run more than once — files already in GridFS are skipped.
 */
const LEGACY_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

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

    const contentType =
      CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';

    await saveFile(name, fs.readFileSync(source), contentType);
    copied += 1;
    console.log(`  copied ${name} (${contentType})`);
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
