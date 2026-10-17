import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';

export const USER_ROLES = ['student', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STUDENT_STATUSES = ['Pending', 'Qualified', 'Not Qualified'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

const userSchema = new Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true, default: 'student' },

    /** Admin login handle (students sign in with their email instead). */
    username: { type: String, trim: true, lowercase: true },
    email: { type: String, trim: true, lowercase: true },

    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    emailVerified: { type: Boolean, default: false },

    /** SHA-256 of the emailed verification token (the raw token is never stored). */
    emailVerificationTokenHash: { type: String },
    emailVerificationExpiresAt: { type: Date },

    /** Forgot-password: hash of the 4-digit code plus its expiry and rate limit. */
    passwordResetCodeHash: { type: String },
    passwordResetExpiresAt: { type: Date },
    passwordResetRequestedAt: { type: Date },
    passwordResetAttempts: { type: Number, default: 0 },

    age: { type: Number, min: 1, max: 120 },
    course: { type: String, trim: true },
    yearLevel: { type: String, trim: true },
    scholarshipType: { type: String, trim: true },
    sex: { type: String, trim: true },
    suffix: { type: String, trim: true },

    /** Only meaningful for students; admins leave it undefined. */
    status: { type: String, enum: STUDENT_STATUSES },

    /** Relative path such as /uploads/1712-abc.jpg. */
    profilePhotoUrl: { type: String, trim: true }
  },
  { timestamps: true }
);

// A user may log in with an email (students) or a username (admins). Both are
// unique, but each document only carries one of them, so the indexes are sparse.
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;

export const User = model('User', userSchema);
