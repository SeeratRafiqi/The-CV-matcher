/**
 * Optional face expression detection using face-api.js.
 * Requires model files in public/models/ (tiny_face_detector_model-*, face_expression_model-*).
 * See https://github.com/justadudewhohacks/face-api.js/tree/master/weights
 */

const MODEL_BASE = '/models';
let faceApiLoaded = false;
let modelsLoaded = false;

export type ExpressionSummary = {
  dominant: string;
  score: number;
  summary: string;
};

async function loadFaceApi() {
  if (faceApiLoaded) return true;
  try {
    await import('face-api.js');
    faceApiLoaded = true;
    return true;
  } catch {
    return false;
  }
}

async function loadModels() {
  if (modelsLoaded) return true;
  try {
    const faceapi = await import('face-api.js');
    const base = MODEL_BASE;
    await Promise.all([
      (faceapi as any).nets.tinyFaceDetector.loadFromUri(base),
      (faceapi as any).nets.faceExpressionNet.loadFromUri(base),
    ]);
    modelsLoaded = true;
    return true;
  } catch {
    return false;
  }
}

const EXPRESSION_LABELS: Record<string, string> = {
  neutral: 'neutral',
  happy: 'engaged and positive',
  sad: 'serious',
  angry: 'intense',
  fearful: 'cautious',
  disgusted: 'reserved',
  surprised: 'attentive',
};

/**
 * Detect face expression from a video element. Returns null if face-api or models aren't loaded.
 */
export async function detectExpressionFromVideo(
  video: HTMLVideoElement
): Promise<ExpressionSummary | null> {
  if (!video || video.readyState < 2) return null;
  try {
    const faceapi = await import('face-api.js');
    const api = faceapi as any;
    const detection = await api
      .detectSingleFace(video, new api.TinyFaceDetectorOptions())
      .withFaceExpressions();
    if (!detection?.expressions) return null;
    const expressions = detection.expressions as Record<string, number>;
    let dominant = 'neutral';
    let maxScore = 0;
    for (const [label, score] of Object.entries(expressions)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = label;
      }
    }
    const summary =
      maxScore > 0.5
        ? `${EXPRESSION_LABELS[dominant] ?? dominant} (${Math.round(maxScore * 100)}%)`
        : 'neutral';
    return { dominant, score: maxScore, summary };
  } catch {
    return null;
  }
}

/**
 * Initialize expression detection (load face-api and models). Call once when camera turns on.
 * Returns true if ready for detection, false otherwise (use "Camera on" as fallback).
 */
export async function initExpressionDetection(): Promise<boolean> {
  const ok = await loadFaceApi() && await loadModels();
  return ok;
}

/**
 * Get a one-line summary for the backend outcome, e.g. "Mostly neutral and engaged; camera on."
 */
export function formatExpressionSummaryForOutcome(
  samples: ExpressionSummary[],
  cameraOn: boolean
): string {
  if (!cameraOn) return '';
  if (!samples.length) return 'Camera on; candidate visible during interview.';
  const dominantCounts: Record<string, number> = {};
  for (const s of samples) {
    const key = s.dominant;
    dominantCounts[key] = (dominantCounts[key] ?? 0) + 1;
  }
  const sorted = Object.entries(dominantCounts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const topLabel = EXPRESSION_LABELS[top?.[0] ?? ''] ?? top?.[0] ?? 'neutral';
  const secondLabel = second ? (EXPRESSION_LABELS[second[0]] ?? second[0]) : null;
  if (secondLabel && (second[1] ?? 0) > samples.length * 0.2) {
    return `Demeanor: mostly ${topLabel}, sometimes ${secondLabel}; camera on.`;
  }
  return `Demeanor: ${topLabel}; camera on.`;
}
