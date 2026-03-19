/**
 * Tracks API/feature usage and cost for admin reporting.
 *
 * - Usage (tokens) is real: from Alibaba API responses (input_tokens, output_tokens).
 * - Pricing: set in .env from Alibaba Cloud billing so cost = real usage × your model's rate.
 *   Official doc: https://www.alibabacloud.com/help/doc-detail/2987148.html
 * - If env not set, we use fallback defaults; admin UI shows "Set .env from Alibaba for your model".
 */

import { UsageLog, type UsageLogErrorType } from '../db/models/UsageLog.js';

/** Alibaba Cloud Model Studio pricing doc (official). */
export const ALIBABA_PRICING_DOC_URL = 'https://www.alibabacloud.com/help/doc-detail/2987148.html';

export interface ExternalApiPricing {
  id: string;
  name: string;
  model: string;
  inputPricePer1M: number | null;
  outputPricePer1M: number | null;
  unit?: string;
  /** TTS: price per 10K characters (International). */
  pricePer10KChars?: number | null;
  pricingSource: 'env' | 'defaults';
}

function parseEnvPrice(key: string): number | null {
  const v = process.env[key];
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** All external APIs this app uses. Pricing from .env when set, else fallback defaults. */
export function getExternalApis(): ExternalApiPricing[] {
  const llmModel = process.env.QWEN_MODEL || 'qwen-turbo';
  const inputFromEnv = parseEnvPrice('ALIBABA_LLM_INPUT_PRICE_PER_1M');
  const outputFromEnv = parseEnvPrice('ALIBABA_LLM_OUTPUT_PRICE_PER_1M');
  const inputPrice = inputFromEnv ?? getLlmInputPriceDefault(llmModel);
  const outputPrice = outputFromEnv ?? getLlmOutputPriceDefault(llmModel);
  const llmSource = inputFromEnv != null && outputFromEnv != null ? 'env' : 'defaults';

  const ttsPricePer10K = parseEnvPrice('ALIBABA_TTS_PRICE_PER_10K_CHARS') ?? 0.115;
  const ttsSource = parseEnvPrice('ALIBABA_TTS_PRICE_PER_10K_CHARS') != null ? 'env' : 'defaults';

  return [
    {
      id: 'dashscope_llm',
      name: 'Alibaba DashScope (Qwen LLM)',
      model: llmModel,
      inputPricePer1M: inputPrice,
      outputPricePer1M: outputPrice,
      unit: 'tokens (International)',
      pricingSource: llmSource,
    },
    {
      id: 'dashscope_tts',
      name: 'Alibaba DashScope (TTS)',
      model: 'qwen3-tts-flash',
      inputPricePer1M: null,
      outputPricePer1M: null,
      pricePer10KChars: ttsPricePer10K,
      unit: 'per 10K characters (International)',
      pricingSource: ttsSource,
    },
  ];
}

/** Fallback defaults from Alibaba doc (Qwen-Turbo etc). Use .env for your exact model. */
function getLlmInputPriceDefault(model: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('qwen-turbo') || m.includes('qwen_turbo')) return 0.05;
  if (m.includes('qwen-plus') || m.includes('qwen_plus')) return 0.4;
  if (m.includes('qwen-max') || m.includes('qwen_max')) return 1.6;
  return 0.05;
}
function getLlmOutputPriceDefault(model: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('qwen-turbo') || m.includes('qwen_turbo')) return 0.2;
  if (m.includes('qwen-plus') || m.includes('qwen_plus')) return 1.2;
  if (m.includes('qwen-max') || m.includes('qwen_max')) return 6.4;
  return 0.2;
}

/** Which external API each feature uses (for cost calculation). */
export const FEATURE_TO_API_ID: Record<string, string> = {
  cv_review: 'dashscope_llm',
  tailor_resume: 'dashscope_llm',
  cover_letter: 'dashscope_llm',
  voice_interview: 'dashscope_llm',
  voice_tts: 'dashscope_tts',
  match_score: 'dashscope_llm',
};

export const FEATURE_CONFIG: Record<
  string,
  { displayName: string; creditsPerCall: number }
> = {
  cv_review: { displayName: 'CV Review', creditsPerCall: 1 },
  tailor_resume: { displayName: 'Tailor Resume', creditsPerCall: 1 },
  cover_letter: { displayName: 'Cover Letter', creditsPerCall: 1 },
  voice_interview: { displayName: 'Voice Interview (LLM)', creditsPerCall: 2 },
  voice_tts: { displayName: 'Voice Interview (TTS)', creditsPerCall: 1 },
  match_score: { displayName: 'Match Score', creditsPerCall: 1 },
};

/** Compute cost from token counts using current API pricing (for display and for new logs). */
export function computeCostFromTokens(
  apiId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const apis = getExternalApis();
  const api = apis.find((a) => a.id === apiId);
  if (!api || api.inputPricePer1M == null || api.outputPricePer1M == null) return 0;
  const inputCost = (inputTokens / 1_000_000) * api.inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * api.outputPricePer1M;
  return Math.round((inputCost + outputCost) * 1e6) / 1e6;
}

/** TTS: International $0.115 per 10K characters. */
export function computeCostFromTtsChars(apiId: string, characters: number): number {
  const apis = getExternalApis();
  const api = apis.find((a) => a.id === apiId);
  const price = api?.pricePer10KChars ?? 0.115;
  return Math.round((characters / 10_000) * price * 1e6) / 1e6;
}

export async function logUsage(
  userId: string,
  feature: string,
  options?: { tokensUsed?: number; inputTokens?: number; outputTokens?: number; ttsCharacters?: number }
): Promise<void> {
  const config = FEATURE_CONFIG[feature] ?? { displayName: feature, creditsPerCall: 1 };
  const apiId = FEATURE_TO_API_ID[feature] ?? 'dashscope_llm';
  const ttsChars = options?.ttsCharacters ?? 0;
  const inputTokens = options?.inputTokens ?? 0;
  const outputTokens = options?.outputTokens ?? 0;
  const totalTokens = options?.tokensUsed ?? ((inputTokens + outputTokens) || null);
  let cost = 0;
  if (ttsChars > 0) {
    cost = computeCostFromTtsChars(apiId, ttsChars);
  } else if (inputTokens > 0 || outputTokens > 0) {
    cost = computeCostFromTokens(apiId, inputTokens, outputTokens);
  }
  try {
    await UsageLog.create({
      user_id: userId,
      feature,
      cost,
      credits_used: config.creditsPerCall,
      tokens_used: totalTokens,
      input_tokens: inputTokens > 0 ? inputTokens : null,
      output_tokens: outputTokens > 0 ? outputTokens : null,
      tts_characters: ttsChars > 0 ? ttsChars : null,
      status: 'success',
      error_type: null,
    });
  } catch (err) {
    console.error('[usage] logUsage failed:', err);
  }
}

/** Log a failed API call for Call Statistics (failures, rate limit, content moderation). */
export async function logUsageFailure(
  userId: string,
  feature: string,
  errorType: UsageLogErrorType = 'other'
): Promise<void> {
  const config = FEATURE_CONFIG[feature] ?? { displayName: feature, creditsPerCall: 1 };
  try {
    await UsageLog.create({
      user_id: userId,
      feature,
      cost: 0,
      credits_used: config.creditsPerCall,
      tokens_used: null,
      input_tokens: null,
      output_tokens: null,
      tts_characters: null,
      status: 'failure',
      error_type: errorType,
    });
  } catch (err) {
    console.error('[usage] logUsageFailure failed:', err);
  }
}

/** Infer error type from HTTP status or error message (for logging failures). */
export function inferErrorType(error: any): UsageLogErrorType {
  const status = error?.response?.status ?? error?.status;
  const msg = String(error?.response?.data?.message ?? error?.message ?? '').toLowerCase();
  if (status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')) return 'rate_limit';
  if (status === 400 || status === 403 || msg.includes('content moderation') || msg.includes('content_moderation') || msg.includes('safety')) return 'content_moderation';
  return 'other';
}
