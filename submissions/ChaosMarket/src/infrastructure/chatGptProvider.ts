import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config/env.js';
import { Evidence, IncidentAnalysis, AnalysisProvider } from '../core/interfaces.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { systemPrompt } from '../prompts/systemPrompt.js';
import { getIncidentAnalysisPrompt } from '../prompts/incidentAnalysis.js';
import { getRetryPrompt } from '../prompts/retryPrompt.js';

// Define the schema returned by ChatGPT
const incidentAnalysisSchema = z.object({
  target_id: z.string(),
  incident_type: z.enum(['DEPENDENCY', 'OUTAGE', 'EXPLOIT']),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  developer_sentiment: z.enum(['FRUSTRATED', 'STALLED', 'ACTIVE']),
  days_stagnant: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
});

type LlmResponse = z.infer<typeof incidentAnalysisSchema>;

// Custom error to differentiate schema/formatting errors from connection errors
export class ValidationError extends Error {
  constructor(message: string, public readonly rawText: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Global AI stats variables
export let totalAiRequests = 0;
export let successfulAiRequests = 0;
export let failedAiRequests = 0;
export let totalAiLatencyMs = 0;
export let totalTokensUsed = 0;
export let estimatedAiCostUsd = 0;

// Simulation override hook
export let simulatedAnalysis: IncidentAnalysis | null = null;

export function injectSimulatedAnalysis(analysis: IncidentAnalysis | null): void {
  simulatedAnalysis = analysis;
}

/**
 * ChatGPT analysis provider implementation of SRE incident detection.
 */
export class ChatGptProvider implements AnalysisProvider {
  private openai: OpenAI | null = null;
  private readonly circuitBreaker: CircuitBreaker<IncidentAnalysis, [Evidence]>;

  constructor() {
    this.circuitBreaker = new CircuitBreaker<IncidentAnalysis, [Evidence]>(
      'ChatGPTAPI',
      (evidence) => this.fetchChatGptAnalysis(evidence),
      async (evidence) => this.runHeuristicAnalysis(evidence)
    );
  }

  /**
   * Lazily initializes and validates the OpenAI client.
   */
  private getOpenAiClient(): OpenAI {
    if (!this.openai) {
      if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'mock_openai_key') {
        const errorMsg = 'Fatal: OPENAI_API_KEY is missing or unconfigured for LIVE/HYBRID mode. Terminating SRE analysis.';
        logger.error('ChatGptProvider', errorMsg);
        throw new Error(errorMsg);
      }

      this.openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        baseURL: config.OPENAI_BASE_URL || undefined,
        timeout: config.OPENAI_TIMEOUT_MS,
      });
    }
    return this.openai;
  }

  public async analyze(evidence: Evidence): Promise<IncidentAnalysis> {
    if (simulatedAnalysis && simulatedAnalysis.targetId === evidence.targetId) {
      logger.info('ChatGptProvider', `Using simulated incident analysis override for ${evidence.targetId}`);
      return simulatedAnalysis;
    }

    if (config.mode === 'SIMULATION') {
      logger.debug('ChatGptProvider', `SIMULATION mode: Executing local heuristic SRE analysis`);
      return this.runHeuristicAnalysis(evidence);
    }

    return this.circuitBreaker.execute(evidence);
  }

  /**
   * Helper that queries OpenAI Chat Completions API.
   */
  private async queryChatGpt(promptContent: string): Promise<{ rawText: string; usage?: OpenAI.CompletionUsage }> {
    const client = this.getOpenAiClient();

    const response = await client.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptContent },
      ],
      temperature: 0,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      response_format: { type: 'json_object' },
    });

    return {
      rawText: response.choices[0]?.message?.content?.trim() || '',
      usage: response.usage,
    };
  }

  /**
   * Performs query, manages retry backoffs, and performs Zod validation.
   */
  private async getValidatedResponse(promptContent: string, isCorrection = false): Promise<LlmResponse> {
    const startTime = Date.now();

    // Query OpenAI with SRE exponential backoff for network/HTTP issues
    const { rawText, usage } = await withRetry(
      () => this.queryChatGpt(promptContent),
      'ChatGptProvider',
      isCorrection ? 'Corrective ChatGPT query' : 'Primary ChatGPT query'
    );

    const latency = Date.now() - startTime;
    totalAiLatencyMs += latency;

    if (usage) {
      totalTokensUsed += usage.total_tokens;
      // Cost: Input: $0.005 / 1K, Output: $0.015 / 1K
      const cost = (usage.prompt_tokens * 0.005 + usage.completion_tokens * 0.015) / 1000;
      estimatedAiCostUsd += cost;
      logger.debug(
        'ChatGptProvider',
        `Latency: ${latency}ms | Tokens: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, comp: ${usage.completion_tokens}) | Cost: $${cost.toFixed(6)}`
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (parseError) {
      const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
      throw new ValidationError(`Invalid JSON format: ${errMsg}`, rawText);
    }

    const validationResult = incidentAnalysisSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      throw new ValidationError(`JSON Schema validation failed: ${validationResult.error.message}`, rawText);
    }

    return validationResult.data;
  }

  /**
   * Main analysis execution orchestrator.
   */
  private async fetchChatGptAnalysis(evidence: Evidence): Promise<IncidentAnalysis> {
    logger.info('ChatGptProvider', `Querying ChatGPT model: ${config.OPENAI_MODEL} for ${evidence.targetId}`);
    totalAiRequests++;

    const userPrompt = getIncidentAnalysisPrompt(evidence);

    try {
      let result: LlmResponse;
      try {
        result = await this.getValidatedResponse(userPrompt, false);
      } catch (primaryError) {
        if (primaryError instanceof ValidationError) {
          logger.warn(
            'ChatGptProvider',
            `JSON validation failed. Triggering corrective ChatGPT retry prompt...`
          );
          const correctivePrompt = getRetryPrompt(primaryError.rawText, primaryError.message);
          result = await this.getValidatedResponse(correctivePrompt, true);
        } else {
          // Network errors or timeouts: propagate to circuit breaker immediately
          throw primaryError;
        }
      }

      successfulAiRequests++;
      return this.mapResponseToInterface(result);
    } catch (finalError) {
      failedAiRequests++;
      logger.error(
        'ChatGptProvider',
        `OpenAI request failed: ${finalError instanceof Error ? finalError.message : String(finalError)}`
      );
      throw finalError;
    }
  }

  /**
   * Local rule-based analyzer that runs offline.
   */
  public async runHeuristicAnalysis(evidence: Evidence): Promise<IncidentAnalysis> {
    logger.debug('ChatGptProvider', `Running heuristic parser offline for target: ${evidence.targetId}`);
    
    let incidentType: 'DEPENDENCY' | 'OUTAGE' | 'EXPLOIT' = 'DEPENDENCY';
    let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let sentiment: 'FRUSTRATED' | 'STALLED' | 'ACTIVE' = 'ACTIVE';
    let daysStagnant = 0;
    let confidence = 0.95;

    // Exploit Heuristics (Smart Contract)
    if (evidence.securityAdvisories === 'CRITICAL' || evidence.securityAdvisories === 'HIGH') {
      incidentType = 'EXPLOIT';
      severity = evidence.securityAdvisories === 'CRITICAL' ? 'HIGH' : 'MEDIUM';
      sentiment = 'FRUSTRATED';
      daysStagnant = evidence.daysSinceIssueCreated;
      confidence = 0.92;
    }
    // Outage Heuristics (Cloud Outage)
    else if (evidence.openIssueCount > 40 && evidence.issueVelocity === 'HIGH') {
      incidentType = 'OUTAGE';
      severity = 'HIGH';
      sentiment = 'FRUSTRATED';
      daysStagnant = Math.max(15, evidence.daysSinceLastComment);
      confidence = 0.88;
    }
    // Dependency Stagnation Heuristics (OS Dependency)
    else if (evidence.repositoryHealth === 'POOR' || evidence.daysSinceLastComment > 7) {
      incidentType = 'DEPENDENCY';
      severity = evidence.daysSinceLastComment > 14 ? 'HIGH' : 'MEDIUM';
      sentiment = 'STALLED';
      daysStagnant = evidence.daysSinceLastComment;
      confidence = 0.90;
    } else {
      // Normal / Healthy
      incidentType = 'DEPENDENCY';
      severity = 'LOW';
      sentiment = 'ACTIVE';
      daysStagnant = 0;
      confidence = 0.99;
    }

    return {
      targetId: evidence.targetId,
      incidentType,
      severity,
      sentiment,
      daysStagnant,
      confidence,
    };
  }

  private mapResponseToInterface(resp: LlmResponse): IncidentAnalysis {
    return {
      targetId: resp.target_id,
      incidentType: resp.incident_type,
      severity: resp.severity,
      sentiment: resp.developer_sentiment,
      daysStagnant: resp.days_stagnant,
      confidence: resp.confidence,
    };
  }
}

export const chatGptProvider = new ChatGptProvider();
export const brainAdapter = chatGptProvider; // Alias for backward compatibility
