/**
 * End-to-end API test.
 *
 * Spins up an in-memory MongoDB so the suite runs without a live Atlas
 * cluster, then exercises the real Express app through supertest.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liceoscholar-uploads-'));
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = uploadDir;
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
process.env.SEED_ON_START = 'false';
process.env.ADMIN_USERNAME = 'authorizedadminscholar';
process.env.ADMIN_PASSWORD = 'AdminScholar2026';
process.env.SEED_STUDENT_PASSWORD = 'Scholar123';
process.env.APP_PUBLIC_URL = 'http://localhost:4200';

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  ✗ ${name}`);
    console.error(error);
  }
}

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();

  const { connectDatabase, disconnectDatabase } = await import('../src/db/connect');
  await connectDatabase(mongod.getUri());

  const { runSeed } = await import('../src/db/seed');
  await runSeed();

  const { createApp } = await import('../src/app');
  const app = createApp();

  const { needsAiReview, buildReviewPrompt } = await import('../src/config/scholarships');
  const { ageFromDateOfBirth, parseDateOfBirth } = await import('../src/utils/date');

  /** Stable small hash so each bad-date signup gets its own email. */
  const hashCode = (value: string): number =>
    [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 7);

  console.log('\nliceoscholar-be API tests\n');

  let adminToken = '';
  let studentToken = '';
  let studentId = '';
  let requirementId = '';
  let formRequirementId = '';
  let uploadedFileUrl = '';
  let verificationToken = '';
  let resetCode = '';

  await check('health endpoint responds', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  await check('rejects admin login with a bad password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'authorizedadminscholar', password: 'wrong' })
      .expect(401);
  });

  await check('admin can sign in with a username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'authorizedadminscholar', password: 'AdminScholar2026' })
      .expect(200);
    assert.equal(res.body.user.role, 'admin');
    assert.ok(res.body.token);
    adminToken = res.body.token as string;
  });

  await check('student list is protected', async () => {
    await request(app).get('/api/students').expect(401);
  });

  await check('admin sees the seeded students', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(res.body.students.length, 4);
    const names = res.body.students.map((s: { fullName: string }) => s.fullName);
    assert.ok(names.some((n: string) => n.includes('Reyes, Christy Ann E.')));
  });

  await check('admin filters students by search term', async () => {
    const res = await request(app)
      .get('/api/students?search=Bean')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(res.body.students.length, 1);
    assert.equal(res.body.students[0].fullName, 'Bean, Teddy Mc. Q.');
  });

  await check('student registration creates an unverified account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Dela Cruz, Juan P.',
        email: 'juan.delacruz@liceo.edu.ph',
        dateOfBirth: '2006-05-04',
        sex: 'Male',
        course: 'College of Information Technology',
        yearLevel: '1st Year',
        scholarshipType: 'Half Academic Scholarship',
        password: 'Password1'
      })
      .expect(201);

    assert.equal(res.body.user.emailVerified, false);
    assert.equal(res.body.user.sex, 'Male');
    assert.equal(res.body.user.course, 'College of Information Technology');
    assert.equal(res.body.user.dateOfBirth, '2006-05-04');
    // Age is no longer part of the account shape; only the date is returned.
    assert.equal(res.body.user.age, undefined);
    studentId = res.body.user.id as string;
  });

  await check('registration rejects an impossible date of birth', async () => {
    for (const dateOfBirth of ['2005-02-30', '2005-13-01', '19-05-2006', 'not-a-date', '']) {
      await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Bad Date',
          email: `bad.${Math.abs(hashCode(dateOfBirth))}@liceo.edu.ph`,
          dateOfBirth,
          sex: 'Male',
          course: 'College of Information Technology',
          yearLevel: '1st Year',
          scholarshipType: 'Half Academic Scholarship',
          password: 'Password1'
        })
        .expect(400);
    }
  });

  await check('registration rejects a date of birth in the future', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'From The Future',
        email: 'future.student@liceo.edu.ph',
        dateOfBirth: tomorrow,
        sex: 'Male',
        course: 'College of Information Technology',
        yearLevel: '1st Year',
        scholarshipType: 'Half Academic Scholarship',
        password: 'Password1'
      })
      .expect(400);
  });

  await check('age is derived from the date of birth, not stored', () => {
    const thisYear = new Date().getUTCFullYear();
    // Someone born on 31 December twenty years ago.
    const december31 = `${thisYear - 20}-12-31`;

    // On the birthday itself, the year has just turned over.
    assert.equal(
      ageFromDateOfBirth(parseDateOfBirth(december31), new Date(Date.UTC(thisYear, 11, 31))),
      20
    );

    // The day before, the birthday has not happened yet.
    assert.equal(
      ageFromDateOfBirth(parseDateOfBirth(december31), new Date(Date.UTC(thisYear, 11, 30))),
      19
    );

    assert.equal(ageFromDateOfBirth(null), null);
  });

  await check('registration rejects weak passwords', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Weak Password',
        email: 'weak@liceo.edu.ph',
        dateOfBirth: '2006-05-04',
        sex: 'Male',
        course: 'College of Information Technology',
        yearLevel: '1st Year',
        scholarshipType: 'Half Academic Scholarship',
        password: 'short'
      })
      .expect(400);
  });

  await check('registration requires a sex', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'No Sex',
        email: 'nosex@liceo.edu.ph',
        dateOfBirth: '2006-05-04',
        course: 'College of Nursing',
        yearLevel: '1st Year',
        scholarshipType: 'Half Academic Scholarship',
        password: 'Password1'
      })
      .expect(400);

    const sexIssue = res.body.details.find((d: { field: string }) => d.field === 'sex');
    assert.ok(sexIssue, 'expected a validation issue for the sex field');
  });

  await check('registration rejects duplicate emails', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Dela Cruz, Juan P.',
        email: 'juan.delacruz@liceo.edu.ph',
        dateOfBirth: '2006-05-04',
        sex: 'Male',
        course: 'College of Information Technology',
        yearLevel: '1st Year',
        scholarshipType: 'Half Academic Scholarship',
        password: 'Password1'
      })
      .expect(409);
  });

  await check('unverified students cannot sign in', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'juan.delacruz@liceo.edu.ph', password: 'Password1' })
      .expect(403);
  });

  await check('registration emails a verification link', async () => {
    const { getCapturedMails } = await import('../src/utils/mailer');
    const mail = getCapturedMails().find((m) => m.to === 'juan.delacruz@liceo.edu.ph');
    assert.ok(mail, 'expected a verification email to be captured');

    const link = new URL(mail!.link);
    assert.equal(link.origin, 'http://localhost:4200');
    assert.equal(link.pathname, '/verify-email');
    verificationToken = link.searchParams.get('token') ?? '';
    assert.match(verificationToken, /^[a-f0-9]{64}$/);
  });

  await check('verification rejects an unknown token', async () => {
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'deadbeef'.repeat(8) })
      .expect(400);
  });

  await check('email verification signs the student in', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);
    assert.equal(res.body.user.emailVerified, true);
    assert.ok(res.body.token);
    studentToken = res.body.token as string;
    studentId = res.body.user.id as string;
  });

  await check('a verification token cannot be reused', async () => {
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(400);
  });

  await check('resend verification issues a fresh link', async () => {
    const { getCapturedMails } = await import('../src/utils/mailer');
    const before = getCapturedMails().length;

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'juan.delacruz@liceo.edu.ph' })
      .expect(200);

    // The account is already verified, so nothing new is emailed.
    assert.equal(getCapturedMails().length, before);

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@liceo.edu.ph' })
      .expect(404);
  });

  await check('forgot password emails a 4-digit code', async () => {
    const { getCapturedMails } = await import('../src/utils/mailer');

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph' })
      .expect(200);

    assert.equal(res.body.expiresInSeconds, 180);
    assert.equal(res.body.resendAfterSeconds, 60);

    const mail = getCapturedMails().filter((m) => m.kind === 'reset').pop();
    assert.ok(mail, 'expected a reset code email to be captured');
    assert.match(mail!.code ?? '', /^\d{4}$/);
    resetCode = mail!.code as string;
  });

  await check('forgot password rate limits a quick resend', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph' })
      .expect(429);
  });

  await check('forgot password rejects an unknown account', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@liceo.edu.ph' })
      .expect(404);
  });

  await check('reset password rejects a wrong code', async () => {
    const wrongCode = resetCode === '0000' ? '1111' : '0000';
    await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph', code: wrongCode, password: 'NewPass123' })
      .expect(400);
  });

  await check('reset password rejects a weak password', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph', code: resetCode, password: 'weak' })
      .expect(400);
  });

  await check('reset password updates the password and allows login', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph', code: resetCode, password: 'NewPass123' })
      .expect(200);

    // The old password no longer works.
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'juan.delacruz@liceo.edu.ph', password: 'Password1' })
      .expect(401);

    // The new password does.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'juan.delacruz@liceo.edu.ph', password: 'NewPass123' })
      .expect(200);
    assert.ok(res.body.token);
  });

  await check('a used reset code cannot be reused', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'juan.delacruz@liceo.edu.ph', code: resetCode, password: 'Another123' })
      .expect(400);
  });

  await check('student profile returns three requirements', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(res.body.requirements.length, 3);
    assert.equal(res.body.user.email, 'juan.delacruz@liceo.edu.ph');
    requirementId = res.body.requirements[0].id as string;
    formRequirementId = (
      res.body.requirements.find((r: { description: string }) => r.description === 'Form') as {
        id: string;
      }
    ).id;
  });

  await check('the university form is excluded from AI review', async () => {
    assert.equal(needsAiReview('2x2 Picture'), true);
    assert.equal(needsAiReview('Report Card for Semester'), true);
    assert.equal(needsAiReview('Form'), false);
    assert.equal(needsAiReview('  form  '), false);
    assert.equal(needsAiReview(''), false);
    assert.equal(needsAiReview(undefined), false);
  });

  await check('a form upload is never sent to the AI', async () => {
    const res = await request(app)
      .post(`/api/me/requirements/${formRequirementId}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('file', Buffer.from('%PDF-1.4 form'), 'application-form.pdf')
      .expect(200);

    // "none" means the automatic reviewer deliberately skipped it. If the AI had
    // run, the state would have been "running" or "error" by now.
    assert.equal(res.body.requirement.analysisState, 'none');
    assert.equal(res.body.requirement.analysis, null);
  });

  await check('the admin cannot force an AI review of the form', async () => {
    const res = await request(app)
      .post(`/api/requirements/${formRequirementId}/analyze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    assert.match(res.body.error, /checked manually/i);
  });

  await check('the grade sheet must be the registrar\'s official copy', async () => {
    const prompt = buildReviewPrompt({
      requirementDescription: 'Report Card for Semester',
      scholarshipType: 'Full Academic Scholarship',
      studentName: 'Juan Dela Cruz'
    });

    // Only the official registrar document is acceptable.
    assert.match(prompt, /OFFICIAL grade sheet issued by the university/);
    assert.match(prompt, /Registrar's Office/i);

    // The common impostors have to be listed as automatic rejects.
    assert.match(prompt, /screenshot of a student portal/i);
    assert.match(prompt, /class list, ranking sheet/i);
    assert.match(prompt, /handwritten grade slip/i);
    assert.match(prompt, /belongs to somebody other than the applicant/i);
  });

  await check('other documents are not given the registrar rule', async () => {
    const prompt = buildReviewPrompt({
      requirementDescription: '2x2 Picture',
      scholarshipType: 'Full Academic Scholarship',
      studentName: 'Juan Dela Cruz'
    });

    assert.doesNotMatch(prompt, /Registrar's Office for the most recent/);
  });

  await check('the 2x2 photo must be recent and well lit', async () => {
    const prompt = buildReviewPrompt({
      requirementDescription: '2x2 Picture',
      scholarshipType: 'Full Academic Scholarship',
      studentName: 'Juan Dela Cruz'
    });

    assert.match(prompt, /recent, well-lit 2x2 identification photo/i);
    assert.match(prompt, /taken recently, within the last year/i);
    assert.match(prompt, /Is well lit/i);

    // Poor lighting and old or non-photographic files have to be rejects.
    assert.match(prompt, /badly lit photo/i);
    assert.match(prompt, /obviously old photo/i);
    assert.match(prompt, /drawing, cartoon, logo, avatar/i);
    assert.match(prompt, /photo of somebody other than the applicant/i);
  });

  await check('a student cannot list students', async () => {
    await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  await check('a student can set their date of birth', async () => {
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ dateOfBirth: '2006-09-30' })
      .expect(200);

    assert.equal(res.body.user.dateOfBirth, '2006-09-30');
    assert.equal(res.body.user.age, undefined);
  });

  await check('a bad date of birth is rejected on update', async () => {
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ dateOfBirth: '2006-02-31' })
      .expect(400);
  });

  await check('student uploads a requirement file', async () => {
    const res = await request(app)
      .post(`/api/me/requirements/${requirementId}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('file', Buffer.from('%PDF-1.4 test'), 'form.pdf')
      .expect(200);

    assert.equal(res.body.requirement.fileName, 'form.pdf');
    assert.match(res.body.requirement.fileUrl, /^\/uploads\//);
    assert.equal(res.body.requirement.status, 'Pending');
    uploadedFileUrl = res.body.requirement.fileUrl as string;
  });

  await check('uploaded file is served statically', async () => {
    const res = await request(app).get(uploadedFileUrl).expect(200);
    assert.match(res.headers['content-type'] ?? '', /application\/pdf/);
  });

  await check('rejects disallowed upload extensions', async () => {
    await request(app)
      .post(`/api/me/requirements/${requirementId}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('file', Buffer.from('binary'), 'virus.exe')
      .expect(400);
  });

  await check('student removes the uploaded file', async () => {
    const res = await request(app)
      .delete(`/api/me/requirements/${requirementId}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(res.body.requirement.fileName, '');
  });

  await check('admin marks a requirement qualified', async () => {
    const res = await request(app)
      .patch(`/api/requirements/${requirementId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Qualified' })
      .expect(200);
    assert.equal(res.body.requirement.status, 'Qualified');
  });

  await check('an unknown status is rejected', async () => {
    await request(app)
      .patch(`/api/requirements/${requirementId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(400);
  });

  await check('admin opens a student with their requirements', async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(res.body.student.fullName, 'Dela Cruz, Juan P.');
    assert.equal(res.body.requirements.length, 3);
  });

  await check('admin updates a student status', async () => {
    const res = await request(app)
      .patch(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Qualified' })
      .expect(200);
    assert.equal(res.body.student.status, 'Qualified');
  });

  await check('an unknown student status is rejected', async () => {
    await request(app)
      .patch(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' })
      .expect(400);
  });

  await check('admin updates their own profile', async () => {
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Batumbakal, Ashton T.' })
      .expect(200);
    assert.equal(res.body.user.fullName, 'Batumbakal, Ashton T.');
  });

  await check('unknown routes return 404', async () => {
    await request(app).get('/api/does-not-exist').expect(404);
  });

  await disconnectDatabase();
  await mongod.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing checks:\n - ${failures.join('\n - ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test run crashed:', error);
  process.exit(1);
});
