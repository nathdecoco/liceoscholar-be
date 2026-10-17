import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { HttpError } from '../utils/http';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
};

// Express identifies this as the error handler by its four-argument signature.
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Please check the highlighted fields.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }

  if (isMulterLimitError(error)) {
    return res.status(413).json({ error: 'The uploaded file is too large.' });
  }

  console.error('[liceoscholar-be] Unhandled error:', error);
  return res.status(500).json({ error: 'Something went wrong on our end.' });
};

function isMulterLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}
