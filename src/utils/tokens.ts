import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Creates a single-use email-verification token.
 *
 * The raw token travels in the emailed link; only its SHA-256 hash is stored,
 * so a leaked database dump cannot be used to confirm accounts.
 */
export function createVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a random 4-digit password-reset code plus the hash that is stored. */
export function createResetCode(): { code: string; codeHash: string } {
  const code = randomInt(0, 10_000).toString().padStart(4, '0');
  return { code, codeHash: hashToken(code) };
}
