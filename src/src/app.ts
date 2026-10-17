import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { uploadRoot } from './middleware/upload';
import { authRouter } from './routes/auth.routes';
import { meRouter } from './routes/me.routes';
import { requirementRouter } from './routes/requirement.routes';
import { studentRouter } from './routes/student.routes';

/** Builds the Express application (no database or network side effects). */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Uploaded profile pictures and requirement files.
  app.use('/uploads', express.static(uploadRoot, { maxAge: '1h', fallthrough: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'liceoscholar-be', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/requirements', requirementRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
