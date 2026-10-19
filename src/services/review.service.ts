import path from 'node:path';

import type { RequirementDoc } from '../models/Requirement';
import type { UserDoc } from '../models/User';

import { env } from '../config/env';
import { buildReviewPrompt, needsAiReview } from '../config/scholarships';
import { readStoredFile } from '../db/gridfs';
import { analyzeRequirementFile, isAnalysable } from '../utils/gemini';

/**
 * Reviews a submitted file in the background so the student's upload is never
 * held up by the AI. The result is written onto the requirement for the
 * administrator to see.
 *
 * Failures are recorded on the requirement (analysisState "error") instead of
 * being thrown, so a Gemini outage can never break an upload.
 */
export async function runAutomaticReview(
  requirement: RequirementDoc,
  student: Pick<UserDoc, 'fullName' | 'scholarshipType'> | null | undefined
): Promise<void> {
  // Some documents (the university form) are checked by staff, so never call
  // the AI for them.
  if (!needsAiReview(requirement.description)) {
    requirement.set({ analysis: undefined, analysisState: 'none', analysisError: undefined });
    await requirement.save();
    return;
  }

  requirement.set({ analysisState: 'running', analysisError: undefined });
  await requirement.save();

  try {
    const mimeType = (requirement.mimeType ?? '').toLowerCase();

    if (!requirement.fileUrl) {
      throw new Error('There is no uploaded file to review.');
    }

    if (!isAnalysable(mimeType)) {
      throw new Error(
        'The AI reviewer can only read images and PDF files. Ask the student to upload a photo or PDF.'
      );
    }

    const stored = await readStoredFile(path.basename(requirement.fileUrl));
    if (!stored) {
      throw new Error('The uploaded file could not be found on the server.');
    }

    const file = stored.data;

    if (file.byteLength > env.geminiMaxFileMb * 1024 * 1024) {
      throw new Error(
        `That file is larger than ${env.geminiMaxFileMb} MB, so it was not reviewed automatically.`
      );
    }

    const analysis = await analyzeRequirementFile({
      base64: file.toString('base64'),
      mimeType,
      prompt: buildReviewPrompt({
        requirementDescription: requirement.description,
        scholarshipType: student?.scholarshipType ?? '',
        studentName: student?.fullName ?? ''
      })
    });

    requirement.set({ analysis, analysisState: 'done', analysisError: undefined });
    await requirement.save();

    console.log(
      `[ai] reviewed requirement ${requirement.id} -> ${analysis.verdict} (${analysis.model})`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI review failed.';
    console.error('[ai] automatic review failed', message);

    requirement.set({ analysisState: 'error', analysisError: message });
    await requirement.save().catch(() => {
      /* Nothing more we can do if even this save fails. */
    });
  }
}