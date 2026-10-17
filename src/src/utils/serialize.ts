import type { RequirementDoc } from '../models/Requirement';
import type { StudentStatus, UserDoc, UserRole } from '../models/User';

/** Shape returned to the browser for a logged-in account. */
export interface ApiUser {
  id: string;
  role: UserRole;
  username: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  age: number | null;
  course: string;
  yearLevel: string;
  scholarshipType: string;
  sex: string;
  suffix: string;
  status: StudentStatus | null;
  profilePhotoUrl: string;
}

/** AI review of a submitted requirement file. */
export interface ApiRequirementAnalysis {
  verdict: string;
  confidence: number;
  documentType: string;
  summary: string;
  recommendation: string;
  model: string;
  analysedAt: string;
  checks: Array<{ criterion: string; passed: boolean; note: string }>;
  issues: string[];
}

/** Shape returned to the browser for a submitted requirement. */
export interface ApiRequirement {
  id: string;
  description: string;
  date: string;
  status: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  analysis: ApiRequirementAnalysis | null;
}

/** Compact row used by the admin student list. */
export interface ApiStudentListItem {
  id: string;
  fullName: string;
  course: string;
  yearLevel: string;
  scholarshipType: string;
  status: StudentStatus | null;
}

export function serializeUser(user: UserDoc): ApiUser {
  return {
    id: user.id as string,
    role: user.role,
    username: user.username ?? '',
    email: user.email ?? '',
    fullName: user.fullName,
    emailVerified: user.emailVerified ?? false,
    age: user.age ?? null,
    course: user.course ?? '',
    yearLevel: user.yearLevel ?? '',
    scholarshipType: user.scholarshipType ?? '',
    sex: user.sex ?? '',
    suffix: user.suffix ?? '',
    status: user.status ?? null,
    profilePhotoUrl: user.profilePhotoUrl ?? ''
  };
}

export function serializeStudentListItem(user: UserDoc): ApiStudentListItem {
  return {
    id: user.id as string,
    fullName: user.fullName,
    course: user.course ?? '',
    yearLevel: user.yearLevel ?? '',
    scholarshipType: user.scholarshipType ?? '',
    status: user.status ?? null
  };
}

export function serializeRequirement(requirement: RequirementDoc): ApiRequirement {
  const analysis = requirement.analysis;

  return {
    id: requirement.id as string,
    description: requirement.description,
    date: requirement.date,
    status: requirement.status,
    fileName: requirement.fileName ?? '',
    fileUrl: requirement.fileUrl ?? '',
    mimeType: requirement.mimeType ?? '',
    analysis:
      analysis && analysis.verdict
        ? {
            verdict: analysis.verdict,
            confidence: analysis.confidence ?? 0,
            documentType: analysis.documentType ?? '',
            summary: analysis.summary ?? '',
            recommendation: analysis.recommendation ?? '',
            model: analysis.model ?? '',
            analysedAt: analysis.analysedAt
              ? new Date(analysis.analysedAt as Date).toISOString()
              : '',
            checks: (analysis.checks ?? []).map((check) => ({
              criterion: check.criterion ?? '',
              passed: Boolean(check.passed),
              note: check.note ?? ''
            })),
            issues: analysis.issues ?? []
          }
        : null
  };
}
