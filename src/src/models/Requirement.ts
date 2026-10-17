import { HydratedDocument, InferSchemaType, Schema, Types, model } from 'mongoose';

export const REQUIREMENT_STATUSES = ['Pending', 'Qualified', 'Not Qualified'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** The three documents every scholarship applicant must submit. */
export const DEFAULT_REQUIREMENTS: readonly string[] = [
  '2x2 Picture',
  'Report Card for Semester',
  'Form'
];

const requirementSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String, required: true, trim: true },

    /** Display date in MM/DD/YYYY form, matching the portal. */
    date: { type: String, required: true },

    status: { type: String, enum: REQUIREMENT_STATUSES, default: 'Pending', required: true },

    /** Latest AI review of the uploaded file, when one has been run. */
    analysis: {
      verdict: String,
      confidence: Number,
      documentType: String,
      summary: String,
      recommendation: String,
      model: String,
      analysedAt: Date,
      checks: [
        {
          _id: false,
          criterion: String,
          passed: Boolean,
          note: String
        }
      ],
      issues: [String]
    },

    fileName: { type: String, trim: true },
    /** Relative path such as /uploads/1712-abc.pdf. */
    fileUrl: { type: String, trim: true },
    mimeType: { type: String, trim: true }
  },
  { timestamps: true }
);

export type Requirement = InferSchemaType<typeof requirementSchema>;
export type RequirementDoc = HydratedDocument<Requirement>;

export const Requirement = model('Requirement', requirementSchema);

export function requirementStudentId(requirement: RequirementDoc): Types.ObjectId {
  return requirement.student as Types.ObjectId;
}
