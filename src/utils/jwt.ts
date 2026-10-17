import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import type { UserRole } from '../models/User';

export interface AuthTokenPayload {
  /** User id. */
  sub: string;
  role: UserRole;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  } as jwt.SignOptions);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('Malformed authentication token');
  }
  return { sub: decoded.sub, role: decoded.role as UserRole };
}

/** Extracts the bearer token from an Authorization header value. */
export function readBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}
