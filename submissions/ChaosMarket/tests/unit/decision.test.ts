import { DecisionEngine } from '../../src/core/decisionEngine.js';
import { RiskResult } from '../../src/core/interfaces.js';

describe('DecisionEngine Confidence Policies', () => {
  let decisionEngine: DecisionEngine;

  beforeEach(() => {
    decisionEngine = new DecisionEngine();
  });

  test('Should preserve original SHORT/EXECUTE when confidence is high (>= 0.80)', () => {
    const risk: RiskResult = {
      probability: 0.85,
      confidence: 0.82,
      catastrophic: true,
      recommendation: 'SHORT',
      action: 'EXECUTE',
    };

    const evaluated = decisionEngine.evaluate(risk);

    expect(evaluated.action).toBe('EXECUTE');
    expect(evaluated.recommendation).toBe('SHORT');
    expect(evaluated.catastrophic).toBe(true);
  });

  test('Should downgrade action to WARN when confidence is medium (0.50 - 0.79)', () => {
    const risk: RiskResult = {
      probability: 0.85,
      confidence: 0.75, // Medium confidence
      catastrophic: true,
      recommendation: 'SHORT',
      action: 'EXECUTE',
    };

    const evaluated = decisionEngine.evaluate(risk);

    expect(evaluated.action).toBe('WARN');
    expect(evaluated.recommendation).toBe('ALERT'); // SHORT maps to ALERT on downgrade
    expect(evaluated.catastrophic).toBe(false); // Prevents execution
  });

  test('Should downgrade action to NONE and recommendation to IGNORE when confidence is low (< 0.50)', () => {
    const risk: RiskResult = {
      probability: 0.85,
      confidence: 0.45, // Low confidence
      catastrophic: true,
      recommendation: 'SHORT',
      action: 'EXECUTE',
    };

    const evaluated = decisionEngine.evaluate(risk);

    expect(evaluated.action).toBe('NONE');
    expect(evaluated.recommendation).toBe('IGNORE');
    expect(evaluated.catastrophic).toBe(false);
  });
});
