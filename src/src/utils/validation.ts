import { isValidObjectId } from 'mongoose';

import { badRequest } from './http';

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
