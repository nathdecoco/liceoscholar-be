import type { NextFunction, Request, Response } from 'express';

import { User, type UserDoc, type UserRole } from '../models/User';
import { forbidden, unauthorized } from '../utils/http';
import { readBearerToken, verifyAuthToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: UserDoc;
    }
  }
}

/** Rejects the request unless it carries a valid, live session token. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    throw unauthorized();
  }

  let userId: string;
  try {
    userId = verifyAuthToken(token).sub;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw unauthorized('This account no longer exists.');
  }

  req.currentUser = user;
  next();
}

/** Must run after requireAuth. */
export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      throw unauthorized();
    }
    if (user.role !== role) {
      throw forbidden(`This action is restricted to ${role} accounts.`);
    }
    next();
  };
}

export function currentUser(req: Request): UserDoc {
  if (!req.currentUser) {
    throw unauthorized();
  }
  return req.currentUser;
}
