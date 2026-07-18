import { injectSimulatedEvidence } from '../infrastructure/anakinAdapter.js';
import { injectSimulatedAnalysis } from '../infrastructure/chatGptProvider.js';
import { logger } from '../utils/logger.js';

/**
 * Incident Simulator for B2B ChaosMarket.
 * Intercepts Evidence and Analysis layers to mock specific failure tracks.
 */
export class IncidentSimulator {
  /**
   * Simulates a major Open Source Dependency Collapse (e.g. facebook/react).
   * Injects low commit rates, stagnant comments, frustrated developer sentiment.
   */
  public simulateDependencyFailure(target: string): void {
    logger.info('IncidentSimulator', `Injecting Dependency Collapse simulation for ${target}`);

    injectSimulatedEvidence({
      targetId: target,
      daysSinceIssueCreated: 35,
      daysSinceLastComment: 18,
      issueVelocity: 'NORMAL',
      maintainerResponseTimeMs: 1209600000, // 14 days
      commitFrequencyPerWeek: 0,
      openIssueCount: 65,
      securityAdvisories: 'MEDIUM',
      repositoryHealth: 'POOR',
    });

    injectSimulatedAnalysis({
      targetId: target,
      incidentType: 'DEPENDENCY',
      severity: 'HIGH',
      sentiment: 'FRUSTRATED',
      daysStagnant: 18,
      confidence: 0.91,
    });
  }

  /**
   * Simulates a major Cloud Provider Outage (e.g., AWS or GCP).
   * Injects critical status discussions, rapid issue velocity, frustrated sentiment.
   */
  public simulateCloudOutage(target: string): void {
    logger.info('IncidentSimulator', `Injecting Cloud Provider Outage simulation for ${target}`);

    injectSimulatedEvidence({
      targetId: target,
      daysSinceIssueCreated: 1,
      daysSinceLastComment: 0,
      issueVelocity: 'HIGH',
      maintainerResponseTimeMs: 180000, // 3 mins
      commitFrequencyPerWeek: 1,
      openIssueCount: 210,
      securityAdvisories: 'HIGH',
      repositoryHealth: 'AVERAGE',
    });

    injectSimulatedAnalysis({
      targetId: target,
      incidentType: 'OUTAGE',
      severity: 'HIGH',
      sentiment: 'FRUSTRATED',
      daysStagnant: 15,
      confidence: 0.88,
    });
  }

  /**
   * Simulates a Smart Contract Exploit vulnerability detection.
   * Injects a critical security disclosure, stalled comments, stalled maintainer activity.
   */
  public simulateExploit(target: string): void {
    logger.info('IncidentSimulator', `Injecting Smart Contract Exploit simulation for ${target}`);

    injectSimulatedEvidence({
      targetId: target,
      daysSinceIssueCreated: 5,
      daysSinceLastComment: 4,
      issueVelocity: 'HIGH',
      maintainerResponseTimeMs: 3600000, // 1 hour
      commitFrequencyPerWeek: 0,
      openIssueCount: 15,
      securityAdvisories: 'CRITICAL',
      repositoryHealth: 'POOR',
    });

    injectSimulatedAnalysis({
      targetId: target,
      incidentType: 'EXPLOIT',
      severity: 'HIGH',
      sentiment: 'STALLED',
      daysStagnant: 4,
      confidence: 0.94,
    });
  }

  /**
   * Cleans all simulation overrides to restore standard behavior.
   */
  public clearSimulation(): void {
    logger.info('IncidentSimulator', 'Clearing all simulated incident overrides.');
    injectSimulatedEvidence(null);
    injectSimulatedAnalysis(null);
  }
}

export const incidentSimulator = new IncidentSimulator();
