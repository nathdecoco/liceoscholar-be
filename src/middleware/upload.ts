import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import multer from 'multer';

import { env } from '../config/env';
import { deleteFile, readStoredFile, saveFile } from '../db/gridfs';
import { HttpError } from '../utils/http';

/**
 * Legacy upload folder.
 *
 * Files uploaded before storage moved to GridFS still live here. They keep
 * being served (and can be copied into GridFS with `npm run migrate:uploads`),
 * but nothing new is written to disk.
 */
export const uploadRoot = path.resolve(process.cwd(), env.uploadDir);

const DOCUMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx'
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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

/** Guesses a content type from a file name (used for legacy disk files). */
export function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Files are held in memory just long enough to reach GridFS. Nothing is
 * written to the server's disk, so uploads survive restarts and are visible
 * from every machine that shares the database.
 */
function createUploader(allowedExtensions: Set<string>, label: string) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        cb(
          new HttpError(
            400,
            `"${file.originalname}" is not an allowed ${label}. ` +
              `Allowed types: ${[...allowedExtensions].join(', ')}.`
          )
        );
        return;
      }
      cb(null, true);
    }
  });
}

/** Accepts requirement documents (images, PDFs and office files). */
export const documentUpload = createUploader(DOCUMENT_EXTENSIONS, 'document');

/** Accepts profile pictures only. */
export const imageUpload = createUploader(IMAGE_EXTENSIONS, 'image');

/** Saves an uploaded file and returns its public `/uploads/...` path. */
export async function storeUpload(file: Express.Multer.File): Promise<string> {
  const extension = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

  return saveFile(filename, file.buffer, file.mimetype);
}

/**
 * Reads a previously uploaded file for the AI reviewer.
 *
 * GridFS is checked first; the legacy disk folder is the fallback so files
 * that were uploaded before the move keep working.
 */
export async function readUploadedFile(fileUrl: string | null | undefined): Promise<Buffer | null> {
  if (!fileUrl) return null;

  const filename = path.basename(fileUrl);
  const stored = await readStoredFile(filename);
  if (stored) return stored.data;

  const legacyPath = path.join(uploadRoot, filename);
  if (!legacyPath.startsWith(uploadRoot)) return null;

  try {
    return await fs.promises.readFile(legacyPath);
  } catch {
    return null;
  }
}

/** Removes an uploaded file from GridFS and from the legacy disk folder. */
export async function deleteUploadedFile(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return;

  const filename = path.basename(fileUrl);

  await deleteFile(filename).catch(() => {
    /* File already removed — nothing to do. */
  });

  const legacyPath = path.join(uploadRoot, filename);
  if (!legacyPath.startsWith(uploadRoot)) return;

  await fs.promises.unlink(legacyPath).catch(() => {
    /* Not on disk — nothing to do. */
  });
}
