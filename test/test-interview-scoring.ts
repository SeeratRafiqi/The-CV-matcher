import assert from 'node:assert/strict';
import { scoreInterviewAnswers } from '../server/services/interviewScoring.js';

function runTests() {
  const result = scoreInterviewAnswers([
    {
      question: 'Q1',
      options: ['A', 'B', 'C', 'D'],
      correctOption: 'A',
      selectedOption: 'A',
      competencyTag: 'communication',
      weight: 10,
    },
    {
      question: 'Q2',
      options: ['A', 'B', 'C', 'D'],
      correctOption: 'C',
      selectedOption: 'B',
      competencyTag: 'communication',
      weight: 10,
    },
    {
      question: 'Q3',
      options: ['A', 'B', 'C', 'D'],
      correctOption: 'D',
      selectedOption: 'D',
      competencyTag: 'ownership',
      weight: 20,
    },
  ]);

  assert.equal(result.overallScore, 75, 'Weighted overall score should be 75');
  assert.equal(result.dimensionScores.communication, 50, 'Communication score should be 50');
  assert.equal(result.dimensionScores.ownership, 100, 'Ownership score should be 100');

  const empty = scoreInterviewAnswers([]);
  assert.equal(empty.overallScore, 0, 'Empty assessment should return score 0');
  assert.deepEqual(empty.dimensionScores, {}, 'Empty assessment should have no dimensions');

  console.log('Interview scoring tests passed');
}

runTests();
