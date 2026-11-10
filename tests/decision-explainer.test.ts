import { describe, expect, it } from 'vitest';
import { explainRuleDecision } from '../src/backend/lib/decision-explainer';
import type { RuleFailure } from '../src/backend/types';

const failures: RuleFailure[] = [
  {
    code: 'ERR_PREREQUISITE_NOT_MET',
    message: 'Complete CS101 with grade C or better before enrolling in CS202.',
    details: { required_course: 'CS101', minimum_grade: 'C' },
  },
];

describe('AI-assisted decision explanation', () => {
  it('uses an available AI binding to explain deterministic failed rules', async () => {
    const ai = {
      run: async () => ({ response: 'You need to pass CS101 before taking CS202.' }),
    };

    await expect(explainRuleDecision(failures, ai)).resolves.toEqual({
      explanation: 'Complete CS101 with grade C or better before enrolling in CS202. You need to pass CS101 before taking CS202.',
      explanation_source: 'AI',
    });
  });

  it('rejects contradictory model output and preserves the deterministic explanation', async () => {
    const ai = {
      run: async () => ({ response: 'You are eligible and can enroll now.' }),
    };

    await expect(explainRuleDecision(failures, ai)).resolves.toEqual({
      explanation: 'Complete CS101 with grade C or better before enrolling in CS202.',
      explanation_source: 'DETERMINISTIC_FALLBACK',
    });
  });

  it('falls back to deterministic rule messages when AI fails', async () => {
    const ai = {
      run: async () => {
        throw new Error('AI unavailable');
      },
    };

    await expect(explainRuleDecision(failures, ai)).resolves.toEqual({
      explanation: 'Complete CS101 with grade C or better before enrolling in CS202.',
      explanation_source: 'DETERMINISTIC_FALLBACK',
    });
  });
});
