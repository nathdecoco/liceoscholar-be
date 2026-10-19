import { Router } from 'express';
import { z } from 'zod';

import { Requirement } from '../models/Requirement';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { SCHOLARSHIPS } from '../config/scholarships';
import { formatDisplayDate, isValidDateOfBirth, parseDateOfBirth } from '../utils/date';
import { badRequest, forbidden, notFound } from '../utils/http';
import { deleteUploadedFile, documentUpload, imageUpload, uploadedFileUrl } from '../middleware/upload';
import { runAutomaticReview } from '../services/review.service';
import { serializeRequirement, serializeUser } from '../utils/serialize';
import { assertObjectId } from '../utils/validation';

export const meRouter = Router();

meRouter.use(requireAuth);

/** Current account plus (for students) the submitted requirements. */
meRouter.get('/', async (req, res) => {
  const user = currentUser(req);

  if (user.role !== 'student') {
    res.json({ user: serializeUser(user), requirements: [] });
    return;
  }

  const requirements = await Requirement.find({ student: user._id }).sort({ createdAt: 1 });
  res.json({ user: serializeUser(user), requirements: requirements.map(serializeRequirement) });
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  dateOfBirth: z
    .string()
    .trim()
    .refine(isValidDateOfBirth, 'Enter a valid date of birth.')
    .transform((value) => parseDateOfBirth(value) as Date)
    .optional(),
  sex: z.string().trim().min(1).max(20).optional(),
  suffix: z.string().trim().max(20).optional(),
  scholarshipType: z
    .string()
    .trim()
    .refine((value) => SCHOLARSHIPS.some((tier) => tier.name === value), {
      message: 'Choose one of the available scholarships.'
    })
    .optional()
});

/** Updates fields the account owner is allowed to edit. */
meRouter.patch('/', async (req, res) => {
  const body = updateProfileSchema.parse(req.body);
  const user = currentUser(req);

  const scholarshipChanged =
    body.scholarshipType !== undefined && body.scholarshipType !== user.scholarshipType;

  if (body.fullName !== undefined) user.fullName = body.fullName;
  if (body.dateOfBirth !== undefined) {
    user.dateOfBirth = body.dateOfBirth;
    // Age is now worked out from the date, so drop the stale stored value.
    user.age = undefined;
  }
  if (body.sex !== undefined) user.sex = body.sex;
  if (body.suffix !== undefined) user.suffix = body.suffix;
  if (body.scholarshipType !== undefined) user.scholarshipType = body.scholarshipType;

  await user.save();

  // The stored AI verdicts were judged against the old scholarship rules, so
  // review the uploaded files again under the new ones.
  if (scholarshipChanged && user.role === 'student') {
    const requirements = await Requirement.find({
      student: user._id,
      fileUrl: { $exists: true, $ne: '' }
    });

    for (const requirement of requirements) {
      void runAutomaticReview(requirement, user);
    }
  }

  res.json({ user: serializeUser(user) });
});

/** Replaces the profile picture for the current account (student or admin). */
meRouter.post('/photo', imageUpload.single('photo'), async (req, res) => {
  const user = currentUser(req);
  if (!req.file) {
    throw badRequest('Attach an image in the "photo" field.');
  }

  deleteUploadedFile(user.profilePhotoUrl);
  user.profilePhotoUrl = uploadedFileUrl(req.file);
  await user.save();

  res.json({ user: serializeUser(user) });
});

/** Student uploads (or replaces) the file for one of their requirements. */
meRouter.post(
  '/requirements/:id/file',
  requireRole('student'),
  documentUpload.single('file'),
  async (req, res) => {
    const user = currentUser(req);
    const requirementId = assertObjectId(String(req.params.id), 'requirement id');
    const requirement = await loadOwnedRequirement(requirementId, user.id as string);

    if (!req.file) {
      throw badRequest('Attach a file in the "file" field.');
    }

    deleteUploadedFile(requirement.fileUrl);
    requirement.fileName = req.file.originalname;
    requirement.fileUrl = uploadedFileUrl(req.file);
    requirement.mimeType = req.file.mimetype;
    requirement.status = 'Pending';
    requirement.date = formatDisplayDate(new Date());
    // A new file always needs a fresh review.
    requirement.set({ analysis: undefined, analysisState: 'none', analysisError: undefined });
    await requirement.save();

    const payload = serializeRequirement(requirement);

    // Review in the background so the student's upload returns immediately.
    void runAutomaticReview(requirement, user);

    res.json({ requirement: payload });
  }
);

/** Student removes the file from one of their requirements. */
meRouter.delete('/requirements/:id/file', requireRole('student'), async (req, res) => {
  const user = currentUser(req);
  const requirementId = assertObjectId(String(req.params.id), 'requirement id');
  const requirement = await loadOwnedRequirement(requirementId, user.id as string);

  deleteUploadedFile(requirement.fileUrl);
  requirement.set({
      fileName: undefined,
      fileUrl: undefined,
      mimeType: undefined,
      status: 'Pending',
      analysis: undefined,
      analysisState: 'none',
      analysisError: undefined
    });
  await requirement.save();

  res.json({ requirement: serializeRequirement(requirement) });
});

async function loadOwnedRequirement(requirementId: string, userId: string) {
  const requirement = await Requirement.findById(requirementId);
  if (!requirement) {
    throw notFound('Requirement not found.');
  }
  if (String(requirement.student) !== userId) {
    throw forbidden('This requirement belongs to another student.');
  }
  return requirement;
}
