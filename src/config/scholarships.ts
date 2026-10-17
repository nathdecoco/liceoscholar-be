/**
 * Scholarship rules.
 *
 * This is the single source of truth: the student dashboard reads it through
 * GET /api/scholarships, and the AI reviewer is given the same text so its
 * verdicts always match what students are shown.
 */

export interface ScholarshipTier {
  /** Stable key used by the frontend. */
  id: string;
  /** Full name, also stored on the student's account. */
  name: string;
  /** Short label for badges and tabs. */
  shortName: string;
  /** One-line summary of the grade/score needed to qualify. */
  qualification: string;
  coverage: string[];
  duration: string;
  entryRequirements: string[];
  renewalGuidelines: string[];
  /** Only listed for the non-academic / special scholarship. */
  programs: string[];
}

export const SCHOLARSHIPS: ScholarshipTier[] = [
  {
    id: 'full-academic',
    name: 'Full Academic Scholarship',
    shortName: 'Full Scholar',
    qualification: '95% and above',
    coverage: ['100% on all school fees', 'Free cloth for school uniform', 'Free books (refund system)'],
    duration: 'Semestral',
    entryRequirements: [
      'Overall highest and second highest from National High Schools and recognized feeder schools are automatically eligible for the grant.',
      'Top 5 graduates from all strands of Liceo U Senior High School are automatically eligible for the grant.',
      'Examinees who score 95% and above shall be given a 100% scholarship on tuition and laboratory fees only.',
      'Scholars may take any course offered by the University.'
    ],
    renewalGuidelines: [
      'Renewal and evaluation of scholarship will be per semester.',
      'Grantee must maintain a 1.00 - 1.20 general weighted average.'
    ],
    programs: []
  },
  {
    id: 'half-academic',
    name: 'Half Academic Scholarship',
    shortName: 'Half Scholar',
    qualification: '90% to 94%',
    coverage: ['50% on tuition fee only'],
    duration: 'Semestral',
    entryRequirements: [
      'Examinees who score 90% to 94% shall be qualified for the grant.',
      'Scholars may take any course offered by the University.'
    ],
    renewalGuidelines: [
      'Renewal and evaluation of scholarship shall be per semester.',
      'Scholars must maintain a 1.21 - 1.40 GWA.'
    ],
    programs: []
  },
  {
    id: 'non-academic',
    name: 'Non-Academic Scholarship',
    shortName: 'Special Scholar',
    qualification: '85% GWA in high school',
    coverage: ['100% on tuition fees only'],
    duration: '4 years',
    entryRequirements: [
      'Granted to students with Special Scholarship must have a GWA of 85% in high school.',
      'Students who are interested or referred to enroll on the programs listed below.'
    ],
    renewalGuidelines: [
      'Students must maintain a GWA of at least 1.7 and above and must have no failing grade.',
      'After one year, students may apply for academic or non-academic scholarships in the succeeding years.'
    ],
    programs: [
      'Bachelor of Library and Information Science',
      'Bachelor of Science in Occupational Therapy',
      'Bachelor of Arts in International Studies',
      'BS Biology',
      'BS Psychology',
      'BS in Electrical Engineering',
      'BS in Civil Engineering',
      'BS in Industrial Engineering',
      'BS in Electrical and Computer Engineering',
      'BS in Information Technology',
      'BS Real Estate Management'
    ]
  }
];

/** Documents every applicant has to submit. */
export const REQUIRED_DOCUMENTS: string[] = [
  '2x2 Picture',
  'Report Card for Semester',
  'Form'
];

/**
 * Documents the scholarship office checks by hand.
 *
 * The university supplies its own application form, so an automated review can
 * only ever misread it. These are never sent to the AI.
 */
export const MANUAL_REVIEW_DOCUMENTS: readonly string[] = ['Form'];

/** True when this document should be reviewed by the AI rather than by staff. */
export function needsAiReview(description: string | null | undefined): boolean {
  const target = (description ?? '').trim().toLowerCase();
  if (!target) return false;

  return !MANUAL_REVIEW_DOCUMENTS.some((doc) => doc.trim().toLowerCase() === target);
}

/** Finds a tier by its full name, as stored on a student's account. */
export function findScholarship(name: string | null | undefined): ScholarshipTier | undefined {
  if (!name) return undefined;
  const target = name.trim().toLowerCase();
  return SCHOLARSHIPS.find((tier) => tier.name.toLowerCase() === target);
}

/** The same rules rendered as plain text, for the AI reviewer. */
export function describeScholarship(tier: ScholarshipTier): string {
  const lines = [
    tier.name.toUpperCase(),
    'COVERAGE',
    ...tier.coverage.map((item) => `- ${item}`),
    'DURATION',
    `- ${tier.duration}`,
    'REQUIREMENTS FOR ENTRY',
    ...tier.entryRequirements.map((item) => `- ${item}`)
  ];

  if (tier.programs.length) {
    lines.push('  Eligible programs:', ...tier.programs.map((item) => `  - ${item}`));
  }

  lines.push('RENEWAL GUIDELINES', ...tier.renewalGuidelines.map((item) => `- ${item}`));

  return lines.join('\n');
}

/** Extra guidance for each kind of document a student submits. */
export const REQUIREMENT_GUIDANCE: Record<string, string> = {
  '2x2 Picture': `The file must be a recent, well-lit 2x2 identification photo of the applicant.

An acceptable photo:
- Shows the applicant alone, facing the camera, with the head and shoulders visible.
- Was taken recently, within the last year, so it is a current likeness.
- Is well lit, with even light across the face and no dark or blown-out shadows.
- Is sharp and in colour, with no heavy blur, pixelation or compression artefacts.
- Has nothing covering the face, such as sunglasses, a cap, a mask or a hand.

Always reject the file when it is any of the following:
- A drawing, cartoon, logo, avatar, or a screenshot of text.
- A photo of an object, scenery or an event that does not show the applicant.
- A badly lit photo where the face is dark, silhouetted or strongly overexposed.
- An obviously old photo, or an image cropped out of a group picture.
- A photo of somebody other than the applicant.

Also check that:
- The face is clearly visible and fills most of the frame.
- The image is large enough to judge, rather than a tiny thumbnail.
- The file is a genuine photograph, not a scan or a document.`,
  'Report Card for Semester': `The file must be the OFFICIAL grade sheet issued by the university
Registrar's Office for the most recent completed semester. Nothing else is acceptable.

An acceptable document:
- Was produced by the Office of the Registrar of Liceo de Cagayan University.
- Shows registrar identity, such as an "Office of the Registrar" heading, a
  registrar's signature, an official stamp, or a "Certified True Copy" mark.
- Lists the student's name and ID number, the semester and school year, each
  subject with its grade and units, and the general weighted average.
- A photocopy or a photo of that official sheet is fine, as long as all of the
  details above are still readable.

Always reject the file when it is any of the following, because none of these are
the registrar's grade sheet:
- A screenshot of a student portal, an online grade view, a learning platform,
  or a messaging app.
- A class list, ranking sheet, class adviser slip, or a list of a classmate's grades.
- A handwritten grade slip, or a list of subjects and grades typed up by the student.
- A certificate, clearance or enrolment slip that does not show subject grades.
- A grade sheet issued by a different institution than the one the applicant attends.
- A report card that belongs to somebody other than the applicant.

Also check that:
- The name on the sheet matches the applicant.
- The semester and school year are shown.
- The grades and the general weighted average are legible, not cut off or blurred.
- The sheet covers the most recent completed semester.

For this scholarship, compare the reported figures against the entry requirements and
renewal guidelines above (for example, the required entrance percentage or the GWA range).`,
  Form: `The file must be the scholarship application/consent form for the university.
Check that:
- It is the correct scholarship form.
- Required fields such as the student's name are filled in and legible.
- The form appears complete rather than a blank template.`
};

/** Used when a requirement name has no specific guidance. */
export const DEFAULT_REQUIREMENT_GUIDANCE = `Check that the file is a genuine, legible document of the expected kind,
is not blank or corrupted, and clearly belongs to the student submitting it.`;

/** Builds the full instruction sent to Gemini for one submission. */
export function buildReviewPrompt(options: {
  requirementDescription: string;
  scholarshipType: string;
  studentName: string;
}): string {
  const tier = findScholarship(options.scholarshipType);
  const rules = tier
    ? describeScholarship(tier)
    : `The applicant is applying for: ${options.scholarshipType || 'an unspecified scholarship'}.`;

  const guidance =
    REQUIREMENT_GUIDANCE[options.requirementDescription] ?? DEFAULT_REQUIREMENT_GUIDANCE;

  return `You are reviewing scholarship application documents for Liceo de Cagayan University.

APPLICANT
- Name: ${options.studentName || 'Not provided'}
- Scholarship applied for: ${options.scholarshipType || 'Not provided'}

SCHOLARSHIP RULES THAT APPLY
${rules}

DOCUMENT EXPECTED
- Requirement: ${options.requirementDescription}
${guidance}

TASK
Look at the attached file and decide whether it satisfies the requirement above.

Important rules for your judgement:
- Judge only what is actually visible in the file.
- If the image is blurry, cropped, blank, or the wrong kind of document, do not guess. Say so.
- If the file does not contain enough information to decide (for example the grades are
  unreadable), use the verdict "needs_review" instead of inventing a result.
- A requirement can be met even if minor cosmetic issues exist.
- Never claim certainty you do not have; use "needs_review" when unsure.

Tone for student-facing text:
- studentAdvice is read directly by the applicant, so be warm, practical and encouraging.
- Tell them what to upload or do next, never that they were rejected or that they failed.
- If a document belongs to someone else, suggest getting their own copy instead.
- If the file is not the registrar's official grade sheet, tell the student to request
  their official grades from the university Registrar's Office.
- Keep it to one short, actionable sentence.

Return only JSON, with:
- verdict: "meets", "does_not_meet", or "needs_review"
- confidence: number between 0 and 1
- documentType: short description of what the file actually shows
- summary: 2-3 sentences an administrator can read at a glance
- checks: an array of {criterion, passed(boolean), note} covering the key requirements
- issues: an array of strings describing anything wrong, missing or unreadable
- recommendation: one short sentence telling the SCHOLARSHIP ADMINISTRATOR what to do
- studentAdvice: one short, friendly sentence telling the STUDENT how to correct this`;
}