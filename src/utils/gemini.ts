import { env } from '../config/env';
import { HttpError } from './http';

/** Structured result produced by the AI reviewer. */
export interface RequirementCheck {
  criterion: string;
  passed: boolean;
  note: string;
}

export type AnalysisVerdict = 'meets' | 'does_not_meet' | 'needs_review';

export interface RequirementAnalysis {
  verdict: AnalysisVerdict;
  confidence: number;
  documentType: string;
  summary: string;
  checks: RequirementCheck[];
  issues: string[];
  /** Written for the administrator: what they should do next. */
  recommendation: string;
  /** Written for the student: friendly, practical advice on how to fix it. */
  studentAdvice: string;
  model: string;
  analysedAt: string;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['meets', 'does_not_meet', 'needs_review'] },
    confidence: { type: 'number' },
    documentType: { type: 'string' },
    summary: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          passed: { type: 'boolean' },
          note: { type: 'string' }
        },
        required: ['criterion', 'passed', 'note']
      }
    },
    issues: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
    studentAdvice: { type: 'string' }
  },
  required: [
    'verdict',
    'confidence',
    'documentType',
    'summary',
    'checks',
    'issues',
    'recommendation',
    'studentAdvice'
  ]
};

/** File types Gemini can actually look at. */
export const ANALYSABLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]);

export function isAnalysable(mimeType: string | undefined | null): boolean {
  return ANALYSABLE_MIME_TYPES.has((mimeType ?? '').toLowerCase());
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/**
 * Tried in order when the configured model is retired or overloaded. Google
 * retires model names fairly often, so this keeps the feature working without
 * anyone having to edit configuration.
 */
const FALLBACK_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];

/** Statuses that mean "try the next model" rather than a real failure. */
const RETRYABLE_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

/**
 * Sends one submitted file to Gemini and returns the structured review.
 * Falls back to another model if the configured one is unavailable.
 * Throws an HttpError with a message that is safe to show the administrator.
 */
export async function analyzeRequirementFile(options: {
  base64: string;
  mimeType: string;
  prompt: string;
}): Promise<RequirementAnalysis> {
  if (!env.geminiApiKey) {
    throw new HttpError(
      503,
      'AI review is not configured. Add GEMINI_API_KEY to the backend .env file.'
    );
  }

  const models = [...new Set([env.geminiModel, ...FALLBACK_MODELS])];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await callGemini(model, options);
    } catch (error) {
      lastError = error;

      const status = error instanceof HttpError ? error.status : undefined;
      if (!status || !RETRYABLE_STATUSES.has(status)) {
        throw error;
      }

      console.warn(`[gemini] model ${model} unavailable (${status}); trying the next one.`);
    }
  }

  throw lastError;
}

async function callGemini(
  model: string,
  options: { base64: string; mimeType: string; prompt: string }
): Promise<RequirementAnalysis> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.geminiTimeoutMs);

  let payload: GeminiResponse;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.geminiApiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: options.prompt },
              { inlineData: { mimeType: options.mimeType, data: options.base64 } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[gemini] ${model} returned ${response.status}: ${detail.slice(0, 300)}`);

      if (response.status === 404) {
        throw new HttpError(404, `The AI model "${model}" is no longer available.`);
      }

      if (response.status === 429 || response.status === 503) {
        throw new HttpError(
          503,
          'The AI review service is busy right now. Please try again in a moment.'
        );
      }

      throw new HttpError(502, `The AI review service returned an error (${response.status}).`);
    }

    payload = (await response.json()) as GeminiResponse;
  } catch (error) {
    if (error instanceof HttpError) throw error;

    if ((error as Error).name === 'AbortError') {
      throw new HttpError(504, 'The AI review took too long. Please try again.');
    }

    console.error(`[gemini] request to ${model} failed`, error);
    throw new HttpError(502, 'The AI review service could not be reached.');
  } finally {
    clearTimeout(timer);
  }

  if (payload.promptFeedback?.blockReason) {
    throw new HttpError(
      422,
      `The AI review was blocked (${payload.promptFeedback.blockReason}). Please review the file manually.`
    );
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) {
    throw new HttpError(
      502,
      payload.candidates?.[0]?.finishReason
        ? `The AI review returned no result (${payload.candidates[0].finishReason}).`
        : 'The AI review returned no result.'
    );
  }

  return parseAnalysis(text, model);
}

/** Turns the model's JSON text into a trusted shape, filling in anything missing. */
function parseAnalysis(text: string, model: string): RequirementAnalysis {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // The model occasionally wraps JSON in a code fence despite the schema.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new HttpError(502, 'The AI review returned an unreadable result.');
    }
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  }

  const verdict: AnalysisVerdict =
    parsed.verdict === 'meets' || parsed.verdict === 'does_not_meet' || parsed.verdict === 'needs_review'
      ? parsed.verdict
      : 'needs_review';

  const confidence = Number(parsed.confidence);
  const checks = Array.isArray(parsed.checks)
    ? parsed.checks
        .filter((check): check is Record<string, unknown> => typeof check === 'object' && check !== null)
        .map((check) => ({
          criterion: String(check.criterion ?? ''),
          passed: Boolean(check.passed),
          note: String(check.note ?? '')
        }))
    : [];

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => String(issue)).filter(Boolean)
    : [];

  return {
    verdict,
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
    documentType: String(parsed.documentType ?? ''),
    summary: String(parsed.summary ?? ''),
    checks,
    issues,
    recommendation: String(parsed.recommendation ?? ''),
    // Older reviews predate this field; fall back to the admin wording rather
    // than showing the student nothing.
    studentAdvice: String(parsed.studentAdvice ?? parsed.recommendation ?? ''),
    model,
    analysedAt: new Date().toISOString()
  };
}