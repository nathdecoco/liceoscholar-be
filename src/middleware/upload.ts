import crypto from 'node:crypto';
import path from 'node:path';

import multer from 'multer';

import { env } from '../config/env';
import { deleteFile, saveFile } from '../db/gridfs';
import { HttpError } from '../utils/http';

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

/**
 * Files are held in memory just long enough to reach GridFS. Nothing is
 * written to the server's disk, which hosting providers wipe between deploys.
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

/** Best-effort removal of a previously stored file. */
export async function deleteUploadedFile(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return;

  await deleteFile(path.basename(fileUrl)).catch(() => {
    /* File already removed — nothing to do. */
  });
}
