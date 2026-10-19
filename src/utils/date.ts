/** Formats a date as MM/DD/YYYY, the shape the portal displays. */
export function formatDisplayDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

/**
 * Date of birth helpers.
 *
 * Dates of birth are exchanged as plain `YYYY-MM-DD` strings so that a birthday
 * never shifts a day because of a timezone difference between the student's
 * browser and the server.
 */

/** Matches `YYYY-MM-DD` and nothing else. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Oldest date we treat as a plausible birth date (120 years ago). */
const EARLIEST_YEAR = new Date().getUTCFullYear() - 120;

/**
 * Turns a `YYYY-MM-DD` string into a Date at UTC midnight.
 *
 * Returns null for anything that is not a real calendar date, so that values
 * like `2005-02-30` or `2005-13-01` are rejected rather than rolled over.
 */
export function parseDateOfBirth(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) return null;

  const [year, month, day] = value.trim().split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC rolls impossible dates over, so compare the parts back.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  if (year < EARLIEST_YEAR) return null;

  return parsed;
}

/** Whole years between a birth date and a reference date (defaults to today). */
export function ageFromDateOfBirth(dateOfBirth: Date | null | undefined, on = new Date()): number | null {
  if (!dateOfBirth) return null;

  const born = dateOfBirth instanceof Date ? dateOfBirth : parseDateOfBirth(dateOfBirth);
  if (!born || Number.isNaN(born.getTime())) return null;

  // Compare in UTC so the server's timezone cannot change the answer.
  const today = Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate());
  if (born.getTime() > today) return null;

  let age = on.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    on.getUTCMonth() > born.getUTCMonth() ||
    (on.getUTCMonth() === born.getUTCMonth() && on.getUTCDate() >= born.getUTCDate());

  if (!hadBirthday) age -= 1;

  return age >= 0 && age <= 120 ? age : null;
}

/** Formats a stored date back to `YYYY-MM-DD` for the API and date inputs. */
export function toDateInputValue(date: Date | string | null | undefined): string | null {
  if (!date) return null;

  const value = date instanceof Date ? date : parseDateOfBirth(date);
  if (!value || Number.isNaN(value.getTime())) return null;

  return value.toISOString().slice(0, 10);
}

/** True when the value is a real, past, plausible birth date. */
export function isValidDateOfBirth(value: unknown): boolean {
  const parsed = parseDateOfBirth(value);
  if (!parsed) return false;

  const today = new Date();
  if (parsed.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) {
    return false;
  }

  const age = ageFromDateOfBirth(parsed, today);
  return age !== null && age >= 1;
}