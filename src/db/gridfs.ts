import { Readable } from 'node:stream';

import mongoose from 'mongoose';

/**
 * Uploaded files live in MongoDB GridFS rather than on the server's disk.
 *
 * Hosting providers give a web service a fresh, temporary filesystem, so
 * anything written to disk disappears on the next restart or deploy. Keeping
 * the bytes in Atlas means profile pictures and requirement documents survive
 * for as long as the database does.
 */
const BUCKET_NAME = 'uploads';

interface StoredFile {
  _id: mongoose.mongo.ObjectId;
  metadata?: { contentType?: string };
}

function bucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('The database connection is not ready yet.');
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

async function findStored(filename: string): Promise<StoredFile | null> {
  const files = await bucket().find({ filename }, { limit: 1 }).toArray();
  return (files[0] as StoredFile | undefined) ?? null;
}

/** Stores bytes under the given name and returns the public `/uploads/...` path. */
export async function saveFile(
  filename: string,
  data: Buffer,
  contentType = 'application/octet-stream'
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, {
      metadata: { contentType }
    });

    upload.once('error', reject);
    upload.end(data, () => resolve());
  });

  return `/uploads/${filename}`;
}

/**
 * Opens a stored file for streaming. Returns null when the name is unknown,
 * which lets the caller answer 404 instead of crashing.
 */
export async function openStoredFile(
  filename: string
): Promise<{ stream: Readable; contentType: string } | null> {
  const stored = await findStored(filename);
  if (!stored) return null;

  return {
    stream: bucket().openDownloadStream(stored._id),
    contentType: stored.metadata?.contentType?.trim() || 'application/octet-stream'
  };
}

/** Reads a stored file fully into memory (used for the AI reviewer). */
export async function readStoredFile(
  filename: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const stored = await openStoredFile(filename);
  if (!stored) return null;

  const chunks: Buffer[] = [];
  for await (const chunk of stored.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }

  return { data: Buffer.concat(chunks), contentType: stored.contentType };
}

/** True when a file with this name is already stored. */
export async function storedFileExists(filename: string): Promise<boolean> {
  return (await findStored(filename)) !== null;
}

/** Removes a stored file. A missing file is not an error. */
export async function deleteFile(filename: string): Promise<void> {
  const stored = await findStored(filename);
  if (!stored) return;
  await bucket().delete(stored._id);
}
