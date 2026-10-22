import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import type { RequirementDoc } from '../models/Requirement';
import { REQUIREMENT_STATUSES, Requirement } from '../models/Requirement';
import { User } from '../models/User';
import { requireAuth, requireRole } from '../middleware/auth';
import { readUploadedFile } from '../middleware/upload';
import { buildReviewPrompt, needsAiReview } from '../config/scholarships';
import { badRequest, notFound } from '../utils/http';
import { analyzeRequirementFile, isAnalysable } from '../utils/gemini';
import { serializeRequirement } from '../utils/serialize';
import { assertObjectId } from '../utils/validation';

export const requirementRouter = Router();

// Requirement status is decided by the scholarship administrator.
requirementRouter.use(requireAuth, requireRole('admin'));

const updateRequirementSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES)
});

/**
 * A requirement can only be reviewed once the student has actually submitted a
 * file. There is nothing to approve or reject otherwise, so the status stays
 * where it is.
 */
function assertHasFile(requirement: RequirementDoc): void {
  if (!requirement.fileUrl) {
    throw badRequest(
      `The "${requirement.description}" has no file uploaded yet, so its status ` +
        'cannot be changed.'
    );
  }
}

/** Approve or disapprove a submitted requirement. */
requirementRouter.patch('/:id', async (req, res) => {
  const { status } = updateRequirementSchema.parse(req.body);
  const requirement = await Requirement.findById(assertObjectId(req.params.id, 'requirement id'));

  if (!requirement) {
    throw notFound('Requirement not found.');
  }

  assertHasFile(requirement);

  requirement.status = status;
  await requirement.save();

  res.json({ requirement: serializeRequirement(requirement) });
});

/**
 * Runs the AI reviewer over a student's submitted file and stores the result
 * on the requirement so the administrator can see it later.
 */
requirementRouter.post('/:id/analyze', async (req, res) => {
  const requirement = await Requirement.findById(assertObjectId(req.params.id, 'requirement id'));

  if (!requirement) {
    throw notFound('Requirement not found.');
  }

  if (!needsAiReview(requirement.description)) {
    throw badRequest(
      `The "${requirement.description}" is checked manually by the scholarship office, ` +
        'so it is not reviewed automatically.'
    );
  }

  if (!requirement.fileUrl) {
    throw badRequest('This requirement has no uploaded file to review yet.');
  }

  const mimeType = (requirement.mimeType ?? '').toLowerCase();
  if (!isAnalysable(mimeType)) {
    throw badRequest(
      'The AI reviewer can only read images and PDF files. ' +
        'Ask the student to upload a photo or a PDF of this document.'
    );
  }

  const student = await User.findById(requirement.student);
  const prompt = buildReviewPrompt({
    requirementDescription: requirement.description,
    scholarshipType: student?.scholarshipType ?? '',
    studentName: student?.fullName ?? ''
  });

  const file = await readUploadedFile(requirement.fileUrl);
  if (!file) {
    throw notFound('The uploaded file could not be found on the server.');
  }

  const maxBytes = env.geminiMaxFileMb * 1024 * 1024;
  if (file.byteLength > maxBytes) {
    throw badRequest(
      `That file is larger than ${env.geminiMaxFileMb} MB. Please ask the student to upload a smaller image or PDF.`
    );
  }

  const analysis = await analyzeRequirementFile({
    base64: file.toString('base64'),
    mimeType,
    prompt
  });

  requirement.set({ analysis, analysisState: 'done', analysisError: undefined });
  await requirement.save();

  res.json({ requirement: serializeRequirement(requirement) });
});
