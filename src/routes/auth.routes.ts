import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { DEFAULT_REQUIREMENTS, Requirement } from '../models/Requirement';
import { User, type UserDoc } from '../models/User';
import { currentUser, requireAuth } from '../middleware/auth';
import { formatDisplayDate, isValidDateOfBirth, parseDateOfBirth } from '../utils/date';
import { HttpError, notFound, unauthorized } from '../utils/http';
import { signAuthToken } from '../utils/jwt';
import { sendPasswordResetEmail, sendVerificationEmail } from '../utils/mailer';
import { hashPassword, verifyPassword } from '../utils/password';
import { serializeUser } from '../utils/serialize';
import { createResetCode, createVerificationToken, hashToken } from '../utils/tokens';

export const authRouter = Router();

/** Builds the link that is emailed to a student to confirm their address. */
function buildVerificationLink(token: string): string {
  return `${env.appPublicUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Stores a fresh verification token on the account and emails the link.
 * The email is sent in the background so registration stays fast and never
 * fails because the mail provider is slow or unavailable.
 */
async function issueVerificationEmail(user: UserDoc): Promise<void> {
  const { token, tokenHash } = createVerificationToken();
  user.emailVerificationTokenHash = tokenHash;
  user.emailVerificationExpiresAt = new Date(Date.now() + env.emailVerificationTtlMinutes * 60_000);
  await user.save();

  void sendVerificationEmail(
    user.email as string,
    user.fullName,
    buildVerificationLink(token)
  );
}

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/\d/, 'Password must include a number.');

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  suffix: z.string().trim().max(20, 'Suffix is too long.').optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid school email.'),
  dateOfBirth: z
    .string()
    .trim()
    .refine(isValidDateOfBirth, 'Enter a valid date of birth.')
    .transform((value) => parseDateOfBirth(value) as Date),
  sex: z.string().trim().min(1, 'Choose your sex.').max(20),
  course: z.string().trim().min(1, 'Choose a course.'),
  yearLevel: z.string().trim().min(1, 'Choose a year level.'),
  scholarshipType: z.string().trim().min(1, 'Choose a scholarship type.'),
  password: passwordSchema
});

const verifyEmailSchema = z.object({
  token: z.string().trim().min(10, 'Enter the verification code from your email.')
});

const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid school email.')
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid school email.')
});

const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid school email.'),
  code: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit code from your email.'),
  password: passwordSchema
});

/** Number of wrong codes allowed before the reset code is thrown away. */
const MAX_RESET_ATTEMPTS = 5;

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username.'),
  password: z.string().min(1, 'Enter your password.')
});

/** Creates a student account that still needs email confirmation. */
authRouter.post('/register', async (req, res) => {
  const body = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: body.email });
  if (existing) {
    throw new HttpError(409, 'An account with this school email already exists.');
  }

  const passwordHash = await hashPassword(body.password);
  const user = await User.create({
    role: 'student',
    email: body.email,
    passwordHash,
    fullName: body.fullName,
    suffix: body.suffix ?? '',
    emailVerified: false,
    dateOfBirth: body.dateOfBirth,
    sex: body.sex,
    course: body.course,
    yearLevel: body.yearLevel,
    scholarshipType: body.scholarshipType,
    status: 'Pending'
  });

  const today = formatDisplayDate(new Date());
  await Requirement.insertMany(
    DEFAULT_REQUIREMENTS.map((description) => ({
      student: user._id,
      description,
      date: today,
      status: 'Pending' as const
    }))
  );

  await issueVerificationEmail(user);

  res.status(201).json({ user: serializeUser(user), emailVerified: false });
});

/**
 * Confirms a pending signup from the token in the emailed link and signs the
 * student in. Tokens are single-use and expire (see EMAIL_VERIFICATION_TTL_MINUTES).
 */
authRouter.post('/verify-email', async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);

  const user = await User.findOne({
    emailVerificationTokenHash: hashToken(token),
    role: 'student'
  });

  if (
    !user
    || !user.emailVerificationExpiresAt
    || user.emailVerificationExpiresAt.getTime() < Date.now()
  ) {
    throw new HttpError(
      400,
      'This verification link is invalid or has expired. Please request a new one.'
    );
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();

  res.json({
    token: signAuthToken({ sub: user.id as string, role: user.role }),
    user: serializeUser(user)
  });
});

/** Re-sends the verification email for an account that has not confirmed yet. */
authRouter.post('/resend-verification', async (req, res) => {
  const { email } = resendVerificationSchema.parse(req.body);

  const user = await User.findOne({ email, role: 'student' });
  if (!user) {
    throw notFound('We could not find an account for that email address.');
  }

  if (user.emailVerified) {
    res.json({ status: 'ok', alreadyVerified: true });
    return;
  }

  await issueVerificationEmail(user);
  res.json({ status: 'ok' });
});

/**
 * Starts a password reset: emails a 4-digit code that expires after
 * PASSWORD_RESET_TTL_MINUTES. A new code can only be requested once every
 * PASSWORD_RESET_RESEND_SECONDS.
 */
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  const user = await User.findOne({ email, role: 'student' });
  if (!user) {
    throw notFound('We could not find an account for that email address.');
  }

  const now = Date.now();
  if (user.passwordResetRequestedAt) {
    const waitedSeconds = (now - user.passwordResetRequestedAt.getTime()) / 1000;
    const retryAfter = Math.ceil(env.passwordResetResendSeconds - waitedSeconds);
    if (retryAfter > 0) {
      throw new HttpError(
        429,
        `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting a new code.`
      );
    }
  }

  const { code, codeHash } = createResetCode();
  user.passwordResetCodeHash = codeHash;
  user.passwordResetExpiresAt = new Date(now + env.passwordResetTtlMinutes * 60_000);
  user.passwordResetRequestedAt = new Date(now);
  user.passwordResetAttempts = 0;
  await user.save();

  void sendPasswordResetEmail(
    user.email as string,
    user.fullName,
    code,
    env.passwordResetTtlMinutes
  );

  res.json({
    status: 'ok',
    expiresInSeconds: env.passwordResetTtlMinutes * 60,
    resendAfterSeconds: env.passwordResetResendSeconds
  });
});

/** Completes a password reset using the emailed 4-digit code. */
authRouter.post('/reset-password', async (req, res) => {
  const { email, code, password } = resetPasswordSchema.parse(req.body);

  const invalid = new HttpError(
    400,
    'That code is invalid or has expired. Please request a new one.'
  );

  const user = await User.findOne({ email, role: 'student' });
  if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
    throw invalid;
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    throw invalid;
  }

  if ((user.passwordResetAttempts ?? 0) >= MAX_RESET_ATTEMPTS) {
    throw invalid;
  }

  if (user.passwordResetCodeHash !== hashToken(code)) {
    user.passwordResetAttempts = (user.passwordResetAttempts ?? 0) + 1;
    if (user.passwordResetAttempts >= MAX_RESET_ATTEMPTS) {
      // Too many wrong guesses: drop the code so a fresh one is required.
      user.passwordResetCodeHash = undefined;
      user.passwordResetExpiresAt = undefined;
    }
    await user.save();
    throw invalid;
  }

  user.passwordHash = await hashPassword(password);
  // Receiving the code proves ownership of the address, so the account counts
  // as confirmed from here on.
  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  user.passwordResetCodeHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.passwordResetRequestedAt = undefined;
  user.passwordResetAttempts = 0;
  await user.save();

  res.json({ status: 'ok' });
});

/** Signs in a student (by email) or an administrator (by username). */
authRouter.post('/login', async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);
  const normalized = identifier.toLowerCase();

  const user = await User.findOne({
    $or: [{ email: normalized }, { username: normalized }]
  });

  const invalid = unauthorized('Invalid username or password.');
  if (!user) {
    throw invalid;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw invalid;
  }

  if (user.role === 'student' && !user.emailVerified) {
    throw new HttpError(403, 'Please confirm your email before logging in.');
  }

  res.json({
    token: signAuthToken({ sub: user.id as string, role: user.role }),
    user: serializeUser(user)
  });
});

/** Returns the account behind the current session. */
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(currentUser(req)) });
});
