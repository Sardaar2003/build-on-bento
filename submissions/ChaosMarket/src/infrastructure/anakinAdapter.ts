import axios from 'axios';
import { Evidence, EvidenceProvider } from '../core/interfaces.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { CircuitBreaker } from './circuitBreaker.js';

// Simulation state override hook
export let simulatedEvidence: Evidence | null = null;

/**
 * Injects mock evidence to override standard simulated behavior.
 */
export function injectSimulatedEvidence(evidence: Evidence | null): void {
  simulatedEvidence = evidence;
}

/**
 * Adapter implementing EvidenceProvider for collecting signals.
 */
export class AnakinAdapter implements EvidenceProvider {
  private readonly circuitBreaker: CircuitBreaker<Evidence, [string]>;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = config.ANAKIN_API_KEY;
    this.baseUrl = config.ANAKIN_BASE_URL;

    this.circuitBreaker = new CircuitBreaker<Evidence, [string]>(
      'AnakinAPI',
      (target) => this.fetchRealEvidence(target),
      (target) => this.fetchMockEvidence(target)
    );
  }

  public async collectEvidence(target: string): Promise<Evidence> {
    if (config.mode === 'SIMULATION' || config.mode === 'HYBRID') {
      logger.debug('AnakinAdapter', `${config.mode} mode: Loading mock evidence for ${target}`);
      return this.fetchMockEvidence(target);
    }

    return this.circuitBreaker.execute(target);
  }

  /**
   * Performs the real API request to Anakin.
   */
  private async fetchRealEvidence(target: string): Promise<Evidence> {
    logger.info('AnakinAdapter', `Querying Anakin API for: ${target}`);

    const callApi = async () => {
      const response = await axios.get(`${this.baseUrl}/evidence`, {
        params: { target },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
        timeout: 5000, // Timeout limit: 5 seconds
      });
      return response.data as Evidence;
    };

    return withRetry(callApi, 'AnakinAdapter', `Fetch evidence for ${target}`);
  }

  /**
   * Returns fallback/mock evidence.
   */
  private async fetchMockEvidence(target: string): Promise<Evidence> {
    if (simulatedEvidence && simulatedEvidence.targetId === target) {
      logger.info('AnakinAdapter', `Using simulated incident evidence override for ${target}`);
      return simulatedEvidence;
    }

    // Default healthy operational signals
    return {
      targetId: target,
      daysSinceIssueCreated: 1,
      daysSinceLastComment: 1,
      issueVelocity: 'NORMAL',
      maintainerResponseTimeMs: 1800000, // 30 mins
      commitFrequencyPerWeek: 35,
      openIssueCount: 12,
      securityAdvisories: 'LOW',
      repositoryHealth: 'EXCELLENT',
    };
  }
}

export const anakinAdapter = new AnakinAdapter();
