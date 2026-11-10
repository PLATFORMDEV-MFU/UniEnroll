import type { AiTextBinding, RuleFailure } from '../types';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const AI_TIMEOUT_MS = 1500;

export type DecisionExplanation = {
  explanation: string;
  explanation_source: 'AI' | 'DETERMINISTIC_FALLBACK';
};

function deterministicExplanation(failedRules: RuleFailure[]): string {
  return failedRules.map((rule) => rule.message).join(' ');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI explanation timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function explainRuleDecision(
  failedRules: RuleFailure[],
  ai?: AiTextBinding,
  model = DEFAULT_MODEL
): Promise<DecisionExplanation> {
  const fallback = deterministicExplanation(failedRules);
  if (!ai) {
    return { explanation: fallback, explanation_source: 'DETERMINISTIC_FALLBACK' };
  }

  try {
    const result = await withTimeout(
      ai.run(model, {
        messages: [
          {
            role: 'system',
            content:
              'Explain university enrollment rejection rules in one short, plain-language sentence. Never change the eligibility decision and never invent new rules.',
          },
          {
            role: 'user',
            content: JSON.stringify({ eligible: false, failed_rules: failedRules }),
          },
        ],
        max_tokens: 100,
      }),
      AI_TIMEOUT_MS
    );
    const explanation = typeof result === 'string' ? result.trim() : result.response?.trim();
    if (!explanation) throw new Error('AI returned an empty explanation');
    if (explanation.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(explanation)) {
      throw new Error('AI returned a malformed explanation');
    }
    if (/\b(you are eligible|requirements? (?:are|is) met|can enroll|approved)\b/i.test(explanation)) {
      throw new Error('AI contradicted the deterministic decision');
    }
    // Keep the canonical failed-rule text verbatim; AI may clarify but can
    // never replace or weaken the deterministic explanation.
    return {
      explanation: fallback ? `${fallback} ${explanation}` : explanation,
      explanation_source: 'AI',
    };
  } catch {
    return { explanation: fallback, explanation_source: 'DETERMINISTIC_FALLBACK' };
  }
}