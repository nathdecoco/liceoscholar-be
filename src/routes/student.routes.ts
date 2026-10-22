import { Router } from 'express';
import { z } from 'zod';
import type { FilterQuery } from 'mongoose';

import { Requirement } from '../models/Requirement';
import { STUDENT_STATUSES, User, type User as UserType } from '../models/User';
import { requireAuth, requireRole } from '../middleware/auth';
import { deleteUploadedFile } from '../middleware/upload';
import { isValidDateOfBirth, parseDateOfBirth } from '../utils/date';
import { badRequest, notFound } from '../utils/http';
import { serializeRequirement, serializeStudentListItem, serializeUser } from '../utils/serialize';
import { assertObjectId, escapeRegExp } from '../utils/validation';
import { sendStatusUpdateEmail } from '../utils/mailer';

export const studentRouter = Router();

// Every route here is administrator-only.
studentRouter.use(requireAuth, requireRole('admin'));

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  scholarshipType: z.string().trim().optional(),
  course: z.string().trim().optional(),
  yearLevel: z.string().trim().optional()
});

/** Lists students, optionally filtered. */
studentRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const filter: FilterQuery<UserType> = { role: 'student' };

  if (query.status) filter.status = query.status;
  if (query.scholarshipType) filter.scholarshipType = query.scholarshipType;
  if (query.yearLevel) filter.yearLevel = query.yearLevel;
  if (query.course) filter.course = new RegExp(`^${escapeRegExp(query.course)}`, 'i');

  if (query.search) {
    const term = new RegExp(escapeRegExp(query.search), 'i');
    filter.$or = [
      { fullName: term },
      { course: term },
      { yearLevel: term },
      { scholarshipType: term },
      { status: term }
    ];
  }

  const students = await User.find(filter).sort({ fullName: 1 });
  res.json({ students: students.map(serializeStudentListItem) });
});

/** One student's profile together with their requirements. */
studentRouter.get('/:id', async (req, res) => {
  const studentId = assertObjectId(req.params.id, 'student id');

  const student = await User.findOne({ _id: studentId, role: 'student' });
  if (!student) {
    throw notFound('Student not found.');
  }

  const requirements = await Requirement.find({ student: student._id }).sort({ createdAt: 1 });
  res.json({
    student: serializeUser(student),
    requirements: requirements.map(serializeRequirement)
  });
});

const updateStudentSchema = z.object({
  status: z.enum(STUDENT_STATUSES).optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  course: z.string().trim().min(1).optional(),
  yearLevel: z.string().trim().min(1).optional(),
  scholarshipType: z.string().trim().min(1).optional(),
  dateOfBirth: z
    .string()
    .trim()
    .refine(isValidDateOfBirth, 'Enter a valid date of birth.')
    .transform((value) => parseDateOfBirth(value) as Date)
    .optional(),
  sex: z.string().trim().min(1).max(20).optional(),
  suffix: z.string().trim().max(20).optional()
});

/** Administrator updates a student's record (mainly the account status). */
studentRouter.patch('/:id', async (req, res) => {
  const body = updateStudentSchema.parse(req.body);
  const studentId = assertObjectId(req.params.id, 'student id');

  const student = await User.findOne({ _id: studentId, role: 'student' });
  if (!student) {
    throw notFound('Student not found.');
  }

  // The application status can only be decided once every submitted document
  // has been reviewed, so an undecided requirement blocks the decision.
  if (body.status && body.status !== 'Pending') {
    const requirements = await Requirement.find({ student: student._id }).select(
      'description status'
    );

    const undecided = requirements.filter(
      (requirement) => requirement.status === 'Pending'
    );

    if (undecided.length > 0) {
      throw badRequest(
        'The application status cannot be changed yet. Review the remaining ' +
          `document${undecided.length > 1 ? 's' : ''} first: ` +
          undecided.map((requirement) => requirement.description).join(', ') +
          '.'
      );
    }
  }

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      student.set(key, value);
    }
  }

  // Age is derived from the date of birth, so drop any stale stored value.
  if (body.dateOfBirth !== undefined) student.age = undefined;

  const previousStatus = student.status;
  await student.save();

  // If the application status changed to a final decision, notify the student by email.
  if (
    body.status &&
    body.status !== previousStatus &&
    (body.status === 'Qualified' || body.status === 'Not Qualified')
  ) {
    void sendStatusUpdateEmail(student.email ?? '', student.fullName, body.status);
  }

  res.json({ student: serializeUser(student) });
});

/**
 * Permanently removes a student along with every document they submitted.
 *
 * Uploaded files are deleted from disk too, so nothing is left orphaned. The
 * administrator account is never a student, so it cannot be removed here.
 */
studentRouter.delete('/:id', async (req, res) => {
  const studentId = assertObjectId(req.params.id, 'student id');

  const student = await User.findOne({ _id: studentId, role: 'student' });
  if (!student) {
    throw notFound('Student not found.');
  }

  const requirements = await Requirement.find({ student: student._id });

  for (const requirement of requirements) {
    deleteUploadedFile(requirement.fileUrl);
  }

  deleteUploadedFile(student.profilePhotoUrl);

  await Requirement.deleteMany({ student: student._id });
  await student.deleteOne();

  res.json({ status: 'ok', removed: student.fullName });
});

/**
 * Closes a semester: every submitted document is cleared and every student goes
 * back to "Pending", ready for the next round of applications.
 *
 * Accounts, profile details and passwords are kept — only the submissions and
 * the decisions taken on them are reset.
 */
studentRouter.post('/reset-semester', async (_req, res) => {
  const students = await User.find({ role: 'student' }).select('_id');
  const studentIds = students.map((student) => student._id);

  const requirements = await Requirement.find({ student: { $in: studentIds } });

  for (const requirement of requirements) {
    deleteUploadedFile(requirement.fileUrl);
  }

  // Wipe the submission itself: no file, no verdict, no review history.
  await Requirement.updateMany(
    { student: { $in: studentIds } },
    {
      $set: {
        status: 'Pending',
        analysisState: 'none'
      },
      $unset: {
        fileName: '',
        fileUrl: '',
        mimeType: '',
        analysis: '',
        analysisError: ''
      }
    }
  );

  const updated = await User.updateMany(
    { role: 'student' },
    { $set: { status: 'Pending' } }
  );

  res.json({
    status: 'ok',
    studentsReset: updated.modifiedCount,
    requirementsCleared: requirements.filter((requirement) => requirement.fileUrl).length
  });
});
