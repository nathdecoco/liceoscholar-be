import { env } from '../config/env';
import { DEFAULT_REQUIREMENTS, type RequirementStatus, Requirement } from '../models/Requirement';
import { type StudentStatus, User } from '../models/User';
import { parseDateOfBirth } from '../utils/date';
import { hashPassword } from '../utils/password';

interface SeedStudent {
  fullName: string;
  email: string;
  course: string;
  yearLevel: string;
  scholarshipType: string;
  status: StudentStatus;
  dateOfBirth: string;
  sex: string;
  requirementDate: string;
  requirementStatuses: RequirementStatus[];
  requirementFileNames: string[];
}

const SEED_STUDENTS: SeedStudent[] = [
  {
    fullName: 'Oliveros, Samantha G. R.',
    email: 'samantha.oliveros@liceo.edu.ph',
    course: 'College of Information Technology',
    yearLevel: '3rd Year',
    scholarshipType: 'Full Academic Scholarship',
    status: 'Qualified',
    dateOfBirth: '2006-02-14',
    sex: 'Female',
    requirementDate: '08/06/2026',
    requirementStatuses: ['Qualified', 'Qualified', 'Qualified'],
    requirementFileNames: ['oliveros-2x2.png', 'oliveros-reportcard.png', 'oliveros-form.pdf']
  },
  {
    fullName: 'Pacatang, Nikki U.',
    email: 'nikki.pacatang@liceo.edu.ph',
    course: 'College of Information Technology',
    yearLevel: '3rd Year',
    scholarshipType: 'Half Academic Scholarship',
    status: 'Pending',
    dateOfBirth: '2005-11-03',
    sex: 'Female',
    requirementDate: '08/06/2026',
    requirementStatuses: ['Pending', 'Qualified', 'Pending'],
    requirementFileNames: ['pacatang-2x2.png', 'pacatang-reportcard.png', '']
  },
  {
    fullName: 'Reyes, Christy Ann E.',
    email: 'christy.reyes@liceo.edu.ph',
    course: 'College of Information Technology',
    yearLevel: '3rd Year',
    scholarshipType: 'Non-Academic Scholarship',
    status: 'Pending',
    dateOfBirth: '2006-07-28',
    sex: 'Female',
    requirementDate: '08/06/2026',
    requirementStatuses: ['Pending', 'Qualified', 'Not Qualified'],
    requirementFileNames: ['Christy2x2.png', 'myreportcard.png', 'screenshot4042_123112.png']
  },
  {
    fullName: 'Bean, Teddy Mc. Q.',
    email: 'teddy.bean@liceo.edu.ph',
    course: 'College of Information Technology',
    yearLevel: '2nd Year',
    scholarshipType: 'Full Academic Scholarship',
    status: 'Not Qualified',
    dateOfBirth: '2006-01-09',
    sex: 'Male',
    requirementDate: '08/06/2026',
    requirementStatuses: ['Qualified', 'Not Qualified', 'Pending'],
    requirementFileNames: ['bean-2x2.png', '', 'bean-form.pdf']
  }
];

/** Seeds demo data only when the database has no accounts yet. */
export async function seedIfEmpty(): Promise<void> {
  const existingAccounts = await User.estimatedDocumentCount();
  if (existingAccounts > 0) {
    return;
  }
  await runSeed();
}

/**
 * Idempotently creates the administrator account and the demo students.
 * Safe to run repeatedly (used by `npm run seed`).
 */
export async function runSeed(): Promise<void> {
  await seedAdministrator();
  await seedStudents();
  console.log(
    `✅ Seeded 1 administrator (${env.adminUsername}) and ${SEED_STUDENTS.length} students`
  );
}

async function seedAdministrator(): Promise<void> {
  const passwordHash = await hashPassword(env.adminPassword);

  await User.findOneAndUpdate(
    { username: env.adminUsername },
    {
      $set: {
        role: 'admin',
        username: env.adminUsername,
        email: 'admin@liceo.edu.ph',
        fullName: 'Batumbakal, Ashton Tantado Jr.',
        passwordHash,
        emailVerified: true,
        sex: 'Male',
        suffix: 'N/A'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seedStudents(): Promise<void> {
  const passwordHash = await hashPassword(env.seedStudentPassword);

  for (const seed of SEED_STUDENTS) {
    const student = await User.findOneAndUpdate(
      { email: seed.email },
      {
        $set: {
          role: 'student',
          email: seed.email,
          fullName: seed.fullName,
          passwordHash,
          emailVerified: true,
          dateOfBirth: parseDateOfBirth(seed.dateOfBirth),
          course: seed.course,
          yearLevel: seed.yearLevel,
          scholarshipType: seed.scholarshipType,
          sex: seed.sex,
          suffix: 'N/A',
          status: seed.status
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const existingRequirements = await Requirement.countDocuments({ student: student._id });
    if (existingRequirements > 0) {
      continue;
    }

    await Requirement.insertMany(
      DEFAULT_REQUIREMENTS.map((description, index) => ({
        student: student._id,
        description,
        date: seed.requirementDate,
        status: seed.requirementStatuses[index] ?? 'Pending',
        fileName: seed.requirementFileNames[index] || undefined,
        fileUrl: undefined,
        mimeType: undefined
      }))
    );
  }
}
