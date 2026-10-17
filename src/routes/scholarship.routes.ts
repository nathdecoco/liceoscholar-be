import { Router } from 'express';

import { REQUIRED_DOCUMENTS, SCHOLARSHIPS } from '../config/scholarships';

export const scholarshipRouter = Router();

/**
 * Scholarship qualifications and requirements.
 * Public so the login and signup screens can show them too.
 */
scholarshipRouter.get('/', (_req, res) => {
  res.json({
    scholarships: SCHOLARSHIPS.map((scholarship) => ({
      id: scholarship.id,
      name: scholarship.name,
      shortName: scholarship.shortName,
      qualification: scholarship.qualification,
      coverage: scholarship.coverage,
      duration: scholarship.duration,
      entryRequirements: scholarship.entryRequirements,
      renewalGuidelines: scholarship.renewalGuidelines,
      programs: scholarship.programs
    })),
    requiredDocuments: REQUIRED_DOCUMENTS
  });
});