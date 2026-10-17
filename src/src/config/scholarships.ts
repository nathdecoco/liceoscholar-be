/**
 * Scholarship rules used by the AI requirement reviewer.
 *
 * Kept in one place so the text that is sent to Gemini always matches the
 * official coverage published by the university.
 */

export const SCHOLARSHIP_RULES: Record<string, string> = {
  'Full Academic Scholarship': `FULL ACADEMIC SCHOLARSHIP
COVERAGE
- 100% on all school fees
- Free cloth for school uniform
- Free books (refund system)
DURATION
- Semestral
REQUIREMENTS FOR ENTRY
- Overall highest and second highest from National High Schools and recognized feeder schools, and top 5 graduates from all strands of Liceo U Senior High School are automatically eligible for the grant.
- Examinees who score 95% and above shall be given a100% scholarship on tuition and laboratory fees only.
- Scholars may take any course offered by the University.
RENEWAL GUIDELINES
- Renewal and evaluation of scholarship will be per semester.
- Grantee must maintain a 1.00 - 1.20 general weighted average.`,

  'Half Academic Scholarship': `HALF ACADEMIC SCHOLARSHIP
COVERAGE
- 50% on tuition fee only
DURATION
- Semestral
REQUIREMENTS FOR ENTRY
- Examinees who score 90% to 94% shall be qualified for the grant.
- Scholars may take any course offered by the University.
RENEWAL GUIDELINES
- Renewal and evaluation of scholarship shall be per semester.
- Scholars must maintain a 1.21 - 1.40 GWA.`,

  'Non-Academic Scholarship': `NON-ACADEMIC / SPECIAL SCHOLARSHIP
COVERAGE
- 100% on tuition fees only
DURATION
- 4 years
REQUIREMENTS FOR ENTRY
- Granted to students with Special Scholarship must have a GWA of 85% in high school.
- Students who are interested or referred to enroll on the following programs:
  Bachelor of Library and Information Science
  Bachelor of Science in Occupational Therapy
  Bachelor of Arts in International Studies
  BS Biology
  BS Psychology
  BS in Electrical Engineering
  BS in Civil Engineering
  BS in Industrial Engineering
  BS in Electrical and Computer Engineering
  BS in Information Technology
  BS Real Estate Management
RENEWAL GUIDELINES
- Students must maintain a GWA of at least 1.7 and above and must have no failing grade.
- After one year, students may apply for academic or non-academic scholarships in the succeeding years.`
};

/** Extra guidance for each kind of document a student submits. */
export const REQUIREMENT_GUIDANCE: Record<string, string> = {
  '2x2 Picture': `The file must be a recent, clear 2x2 identification photo of the student.
Check that:
- It is a photograph of a single person.
- The photo is reasonably sharp, well lit and in colour.
- It is not a drawing, logo, screenshot of text, or a random picture.
- Nothing covers the face.`,
  'Report Card for Semester': `The file must be a report card or grade sheet for the most recent semester.
Check that:
- It shows the student's name and the reporting period/school year.
- Grades or a general weighted average are visible and legible.
- The document looks like an official report card, not a screenshot of unrelated content.
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
  const rules =
    SCHOLARSHIP_RULES[options.scholarshipType] ??
    `The applicant is applying for: ${options.scholarshipType || 'an unspecified scholarship'}.`;

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

Return only JSON, with:
- verdict: "meets", "does_not_meet", or "needs_review"
- confidence: number between 0 and 1
- documentType: short description of what the file actually shows
- summary: 2-3 sentences an administrator can read at a glance
- checks: an array of {criterion, passed(boolean), note} covering the key requirements
- issues: an array of strings describing anything wrong, missing or unreadable
- recommendation: one short sentence telling the administrator what to do next`;
}