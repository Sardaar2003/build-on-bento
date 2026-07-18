import axios from 'axios';
import OpenAI from 'openai';
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
    logger.info('AnakinAdapter', `Querying real-time Anakin Search API for: ${target}`);

    const callApi = async () => {
      // 1. Post request to the real Anakin Search endpoint (/search)
      const response = await axios.post(`${this.baseUrl}/search`, {
        prompt: `github repository ${target} recent issues, status page, open issues count, commit frequency, security alerts, and health metrics`,
        limit: 5,
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000, // Timeout limit: 10 seconds for real search
      });

      const searchResults = response.data.results || [];
      logger.info('AnakinAdapter', `Acquired ${searchResults.length} search hits from Anakin. Commencing AI extraction...`);

      const snippetsText = searchResults.map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet}\nUrl: ${r.url}`).join('\n\n');

      // 2. Initialize OpenAI to parse unstructured search text into SRE JSON metrics
      const openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        baseURL: config.OPENAI_BASE_URL,
        timeout: config.OPENAI_TIMEOUT_MS,
      });

      const chatCompletion = await openai.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an SRE telemetry extractor. Analyze the search results of a target repository and output ONLY a raw JSON object matching the requested schema. Do not write markdown blocks or surrounding text.',
          },
          {
            role: 'user',
            content: `Based on the following search results about the target repository "${target}", extract/estimate the SRE status parameters.
            
Search Results:
${snippetsText}

Output a raw JSON matching this schema:
{
  "daysSinceIssueCreated": number,
  "daysSinceLastComment": number,
  "issueVelocity": "LOW" | "NORMAL" | "HIGH",
  "maintainerResponseTimeMs": number,
  "commitFrequencyPerWeek": number,
  "openIssueCount": number,
  "securityAdvisories": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "repositoryHealth": "EXCELLENT" | "AVERAGE" | "POOR"
}

Rules:
1. Return ONLY the raw JSON object.
2. Do NOT wrap output inside markdown formatting blocks like \`\`\`json.
3. If search results indicates excellent health, return optimistic values. If they indicate stagnation, outages, or vulnerabilities, adjust the numbers accordingly.`,
          },
        ],
        temperature: 0,
      });

      const text = chatCompletion.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(text);

      return {
        targetId: target,
        daysSinceIssueCreated: Number(parsed.daysSinceIssueCreated) || 1,
        daysSinceLastComment: Number(parsed.daysSinceLastComment) || 1,
        issueVelocity: parsed.issueVelocity || 'NORMAL',
        maintainerResponseTimeMs: Number(parsed.maintainerResponseTimeMs) || 1800000,
        commitFrequencyPerWeek: Number(parsed.commitFrequencyPerWeek) || 35,
        openIssueCount: Number(parsed.openIssueCount) || 12,
        securityAdvisories: parsed.securityAdvisories || 'LOW',
        repositoryHealth: parsed.repositoryHealth || 'EXCELLENT',
      } as Evidence;
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
