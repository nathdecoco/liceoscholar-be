import mongoose from 'mongoose';

import { env } from '../config/env';

/** Connects to MongoDB Atlas using MONGODB_URI (or an explicit override). */
export async function connectDatabase(uri: string = env.mongoUri): Promise<void> {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env and paste your MongoDB Atlas connection string.'
    );
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000
  });

  console.log('✅ Connected to MongoDB');
}

/**
 * Keeps trying to reach the database instead of giving up on the first
 * failure. Home/office IP addresses change often, so Atlas may briefly refuse
 * the connection until the new address is whitelisted.
 */
export async function connectWithRetry(
  uri: string = env.mongoUri,
  attempts = 40,
  delayMs = 5_000
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connectDatabase(uri);
      return;
    } catch (error) {
      const last = attempt === attempts;
      console.error(
        `⚠️  Database connection attempt ${attempt}/${attempts} failed.`
      );

      if (last) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
