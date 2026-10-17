/**
 * Sets the administrator password.
 *
 * Usage: npx tsx set-admin-password.ts <new-password>
 */
import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from './src/db/connect';
import { User } from './src/models/User';
import { hashPassword } from './src/utils/password';

async function main(): Promise<void> {
  const password = process.argv[2];

  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    console.error(
      'Password must be at least 8 characters and include an uppercase letter and a number.'
    );
    process.exit(1);
  }

  await connectDatabase();

  const admin = await User.findOneAndUpdate(
    { role: 'admin' },
    {
      $set: {
        email: 'admin@liceo.edu.ph',
        emailVerified: true,
        passwordHash: await hashPassword(password)
      }
    },
    { new: true }
  );

  if (!admin) {
    console.error('No administrator account found.');
    await disconnectDatabase();
    process.exit(1);
  }

  console.log(`✅ Administrator password updated`);
  console.log(`   email    : ${admin.email}`);
  console.log(`   username : ${admin.username || '(none)'}`);
  console.log(`   fullName : ${admin.fullName}`);

  await disconnectDatabase();
}

main().catch((error) => {
  console.error('Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});