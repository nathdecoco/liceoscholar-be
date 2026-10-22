import { isValidObjectId } from 'mongoose';

import { badRequest } from './http';

/**
 * Students sign in with their Liceo de Cagayan University address, so every
 * student email in the auth flow is restricted to this domain.
 */
export const SCHOOL_EMAIL_DOMAIN = '@liceo.edu.ph';

/** True when the value is an address on the school domain. */
export function isSchoolEmail(value: string): boolean {
  return value.trim().toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN);
}

/** Guards against invalid ObjectId path params before they reach Mongoose. */
export function assertObjectId(value: string, label = 'id'): string {
  if (!isValidObjectId(value)) {
    throw badRequest(`"${value}" is not a valid ${label}.`);
  }
  return value;
}

/** Escapes user input before it is used inside a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
