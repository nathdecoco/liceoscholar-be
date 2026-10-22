import { connectDatabase, disconnectDatabase } from './connect';
import { Requirement } from '../models/Requirement';
import { User } from '../models/User';

/**
 * Normalises the two status vocabularies:
 *
 *   Application status (the student account) : Pending | Qualified | Not Qualified
 *   Document status (each requirement)       : Pending | Passed    | Not Passed
 *
 * Older records used "Qualified" / "Not Qualified" for documents too, and an
 * earlier build briefly wrote "Passed" / "Not Passed" onto accounts. Both are
 * corrected here. Running it twice changes nothing the second time.
 *
 * Run with: npm run migrate:statuses
 */
async function main(): Promise<void> {
  await connectDatabase();

  // Documents: Qualified -> Passed, Not Qualified -> Not Passed.
  const requirementsPassed = await Requirement.updateMany(
    { status: 'Qualified' },
    { $set: { status: 'Passed' } }
  );
  const requirementsNotPassed = await Requirement.updateMany(
    { status: 'Not Qualified' },
    { $set: { status: 'Not Passed' } }
  );

  // Accounts: Passed -> Qualified, Not Passed -> Not Qualified.
  const accountsQualified = await User.updateMany(
    { status: 'Passed' },
    { $set: { status: 'Qualified' } }
  );
  const accountsNotQualified = await User.updateMany(
    { status: 'Not Passed' },
    { $set: { status: 'Not Qualified' } }
  );

  await disconnectDatabase();

  console.log(
    `✅ Requirements: ${requirementsPassed.modifiedCount} -> Passed, ` +
      `${requirementsNotPassed.modifiedCount} -> Not Passed.`
  );
  console.log(
    `✅ Accounts: ${accountsQualified.modifiedCount} -> Qualified, ` +
      `${accountsNotQualified.modifiedCount} -> Not Qualified.`
  );
}

main().catch((error) => {
  console.error('❌ Status migration failed:', error);
  process.exit(1);
});
