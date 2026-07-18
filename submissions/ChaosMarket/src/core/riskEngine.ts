import { Evidence, IncidentAnalysis, RiskResult, RiskCalculator } from './interfaces.js';
import { logger } from '../utils/logger.js';

/**
 * Mathematical Risk Engine for computing infrastructure failure probability.
 * Implements: P = S * M * (1 - e^(-lambda * t)) * RepHealth * IssueVelocity * SecurityWeight
 */
export class RiskEngine implements RiskCalculator {
  private readonly lambda = 0.15;

  private readonly severityWeights: Record<IncidentAnalysis['severity'], number> = {
    HIGH: 0.85,
    MEDIUM: 0.50,
    LOW: 0.20,
  };

  private readonly sentimentMultipliers: Record<IncidentAnalysis['sentiment'], number> = {
    FRUSTRATED: 1.20,
    STALLED: 1.20,
    ACTIVE: 0.90,
  };

  private readonly repoHealthMultipliers: Record<Evidence['repositoryHealth'], number> = {
    EXCELLENT: 0.80,
    AVERAGE: 1.00,
    POOR: 1.25,
  };

  private readonly issueVelocityMultipliers: Record<Evidence['issueVelocity'], number> = {
    LOW: 0.90,
    NORMAL: 1.00,
    HIGH: 1.20,
  };

  private readonly securityWeightMultipliers: Record<Evidence['securityAdvisories'], number> = {
    CRITICAL: 1.30,
    HIGH: 1.15,
    MEDIUM: 1.00,
    LOW: 0.90,
  };

  public calculate(analysis: IncidentAnalysis, evidence: Evidence): RiskResult {
    const s = this.severityWeights[analysis.severity];
    const m = this.sentimentMultipliers[analysis.sentiment];
    
    // Clamp t (daysStagnant) to a minimum of 0
    const t = Math.max(0, analysis.daysStagnant);
    const timeFactor = 1 - Math.exp(-this.lambda * t);

    const repoHealth = this.repoHealthMultipliers[evidence.repositoryHealth];
    const issueVelocity = this.issueVelocityMultipliers[evidence.issueVelocity];
    const securityWeight = this.securityWeightMultipliers[evidence.securityAdvisories];

    // Compute basic mathematical probability
    const calculatedProbability = s * m * timeFactor * repoHealth * issueVelocity * securityWeight;

    // Clamp probability strictly between 0.0 and 1.0
    const clampedProbability = Math.max(0, Math.min(1, calculatedProbability));

    logger.debug(
      'RiskEngine',
      `Probability components: S=${s}, M=${m}, timeFactor=${timeFactor.toFixed(4)} (t=${t}), HealthMultiplier=${repoHealth}, VelocityMultiplier=${issueVelocity}, SecurityMultiplier=${securityWeight}`
    );
    logger.debug('RiskEngine', `Raw calculated probability: ${calculatedProbability.toFixed(4)}, Clamped: ${clampedProbability.toFixed(4)}`);

    // Determine initial recommendation and action based on Decision Matrix
    let recommendation: RiskResult['recommendation'] = 'IGNORE';
    let action: RiskResult['action'] = 'NONE';

    if (clampedProbability < 0.40) {
      recommendation = 'IGNORE';
      action = 'NONE';
    } else if (clampedProbability >= 0.40 && clampedProbability < 0.60) {
      recommendation = 'MONITOR';
      action = 'POLL';
    } else if (clampedProbability >= 0.60 && clampedProbability < 0.75) {
      recommendation = 'ALERT';
      action = 'WARN';
    } else if (clampedProbability >= 0.75) {
      recommendation = 'SHORT';
      action = 'EXECUTE';
    }

    return {
      probability: clampedProbability,
      confidence: analysis.confidence,
      catastrophic: clampedProbability >= 0.75,
      recommendation,
      action,
    };
  }
}

export const riskEngine = new RiskEngine();
