export interface ScoringQuestionInput {
  question: string;
  options: string[];
  correctOption: string;
  selectedOption: string | null;
  competencyTag: string;
  weight: number;
}

export interface ScoringResult {
  overallScore: number;
  dimensionScores: Record<string, number>;
}

export function scoreInterviewAnswers(answers: ScoringQuestionInput[]): ScoringResult {
  let totalWeight = 0;
  let correctWeight = 0;
  const dimensionTotals: Record<string, { total: number; correct: number }> = {};

  for (const row of answers) {
    const weight = Number.isFinite(row.weight) ? Math.max(1, row.weight) : 1;
    totalWeight += weight;
    const isCorrect = !!row.selectedOption && row.selectedOption === row.correctOption;
    if (isCorrect) correctWeight += weight;

    const dimension = row.competencyTag || 'behavior';
    if (!dimensionTotals[dimension]) {
      dimensionTotals[dimension] = { total: 0, correct: 0 };
    }
    dimensionTotals[dimension].total += weight;
    if (isCorrect) dimensionTotals[dimension].correct += weight;
  }

  const overallScore = totalWeight > 0 ? Math.round((correctWeight / totalWeight) * 100) : 0;
  const dimensionScores: Record<string, number> = {};
  for (const key of Object.keys(dimensionTotals)) {
    const item = dimensionTotals[key];
    dimensionScores[key] = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
  }

  return { overallScore, dimensionScores };
}
