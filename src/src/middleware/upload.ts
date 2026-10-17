import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import multer from 'multer';

import { env } from '../config/env';
import { HttpError } from '../utils/http';

/** Absolute directory that uploaded files are written to. */
export const uploadRoot = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

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

function createUploader(allowedExtensions: Set<string>, label: string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
    }
  });

  return multer({
    storage,
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

export function uploadedFileUrl(file: Express.Multer.File): string {
  return `/uploads/${file.filename}`;
}

/** Best-effort removal of a previously uploaded file from disk. */
export function deleteUploadedFile(fileUrl: string | null | undefined): void {
  if (!fileUrl) return;

  const target = path.join(uploadRoot, path.basename(fileUrl));
  if (!target.startsWith(uploadRoot)) return;

  fs.promises.unlink(target).catch(() => {
    /* File already removed — nothing to do. */
  });
}
