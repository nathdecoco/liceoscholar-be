import { Router } from 'express';
import { z } from 'zod';
import type { FilterQuery } from 'mongoose';

import { Requirement } from '../models/Requirement';
import { STUDENT_STATUSES, User, type User as UserType } from '../models/User';
import { requireAuth, requireRole } from '../middleware/auth';
import { notFound } from '../utils/http';
import { serializeRequirement, serializeStudentListItem, serializeUser } from '../utils/serialize';
import { assertObjectId, escapeRegExp } from '../utils/validation';

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
  age: z.coerce.number().int().min(1).max(120).optional(),
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

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      student.set(key, value);
    }
  }

  await student.save();
  res.json({ student: serializeUser(student) });
});
