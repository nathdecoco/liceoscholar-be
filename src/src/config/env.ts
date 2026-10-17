import 'dotenv/config';

function optionalNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number but received "${value}"`);
  }
  return parsed;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env and fill it in.'
    );
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: optionalNumber(process.env.PORT, 4000),

  /** MongoDB Atlas connection string, e.g. mongodb+srv://user:pass@cluster/... */
  get mongoUri(): string {
    return required('MONGODB_URI', process.env.MONGODB_URI);
  },

  jwtSecret: process.env.JWT_SECRET ?? 'liceoscholar-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Credentials for the seeded administrator account (username login). */
  adminUsername: process.env.ADMIN_USERNAME ?? 'authorizedadminscholar',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'AdminScholar2026',

  /** Password given to every seeded demo student. */
  seedStudentPassword: process.env.SEED_STUDENT_PASSWORD ?? 'Scholar123',

  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: optionalNumber(process.env.MAX_UPLOAD_MB, 12),

  /**
   * Absolute base URL used when building file links. When empty the server
   * derives it from the incoming request (works for local development).
   */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),

  seedOnStart: (process.env.SEED_ON_START ?? 'true') !== 'false',

  /** Base URL of the web app, used to build the links inside verification emails. */
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(/\/$/, ''),

  /** How long an email-verification link stays valid (minutes). */
  emailVerificationTtlMinutes: optionalNumber(process.env.EMAIL_VERIFICATION_TTL_MINUTES, 60 * 24),

  /**
   * SMTP transport used to send verification emails.
   * When SMTP_HOST is empty the mailer falls back to logging the link (and to a
   * disposable Ethereal inbox outside production) so local development works
   * without an email account.
   */
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: optionalNumber(process.env.SMTP_PORT, 587),
  smtpSecure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  mailFrom: process.env.MAIL_FROM ?? '',

  /** How long a password-reset code stays valid (minutes). */
  passwordResetTtlMinutes: optionalNumber(process.env.PASSWORD_RESET_TTL_MINUTES, 3),

  /** Minimum wait before a new password-reset code may be requested (seconds). */
  passwordResetResendSeconds: optionalNumber(process.env.PASSWORD_RESET_RESEND_SECONDS, 60),

  /**
   * Google Gemini API key used to review submitted requirement files.
   * When empty the AI review endpoint replies with a clear "not configured"
   * message instead of failing.
   */
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',

  /** Vision-capable Gemini model used for the requirement review. */
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',

  /** How long to wait for Gemini before giving up (milliseconds). */
  geminiTimeoutMs: optionalNumber(process.env.GEMINI_TIMEOUT_MS, 60_000),

  /**
   * Largest file sent to Gemini. Inline data is capped, so anything bigger is
   * refused with a clear message rather than failing mid-request.
   */
  geminiMaxFileMb: optionalNumber(process.env.GEMINI_MAX_FILE_MB, 8)
};

export type Env = typeof env;
