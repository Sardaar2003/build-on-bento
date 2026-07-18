import { RiskResult } from './interfaces.js';
import { logger } from '../utils/logger.js';

/**
 * Business Logic Engine that applies the AI Confidence Policy to calculated Risk Results.
 * Prevents automated actions on low-confidence outputs.
 */
export class DecisionEngine {
  /**
   * Evaluates and potentially downgrades a RiskResult based on the confidence score.
   */
  public evaluate(result: RiskResult): RiskResult {
    const { probability, confidence, recommendation, action } = result;

    // Confidence Policy Rule 1: High confidence (>= 0.80) -> Keep original recommendation and action
    if (confidence >= 0.80) {
      logger.debug(
        'DecisionEngine',
        `High AI Confidence (${(confidence * 100).toFixed(1)}%) confirmed. Proceeding with ${recommendation}/${action}.`
      );
      return { ...result };
    }

    // Confidence Policy Rule 2: Medium confidence (0.50 - 0.79) -> Downgrade action to WARN
    if (confidence >= 0.50) {
      logger.warn(
        'DecisionEngine',
        `Medium AI Confidence (${(confidence * 100).toFixed(1)}%). Action downgraded to WARN/ALERT. Trade execution suspended.`
      );
      return {
        probability,
        confidence,
        catastrophic: false, // Never execute a Bento trade
        recommendation: recommendation === 'SHORT' ? 'ALERT' : recommendation,
        action: 'WARN',
      };
    }

    // Confidence Policy Rule 3: Low confidence (< 0.50) -> Ignore prediction (NONE / IGNORE)
    logger.warn(
      'DecisionEngine',
      `Low AI Confidence (${(confidence * 100).toFixed(1)}%). Prediction ignored (action: NONE).`
    );
    return {
      probability,
      confidence,
      catastrophic: false,
      recommendation: 'IGNORE',
      action: 'NONE',
    };
  }
}

export const decisionEngine = new DecisionEngine();
