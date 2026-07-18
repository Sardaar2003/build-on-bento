/**
 * Represents raw evidence collected from engineering platforms.
 */
export interface Evidence {
  targetId: string;
  daysSinceIssueCreated: number;
  daysSinceLastComment: number;
  issueVelocity: "LOW" | "NORMAL" | "HIGH";
  maintainerResponseTimeMs: number;
  commitFrequencyPerWeek: number;
  openIssueCount: number;
  securityAdvisories: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  repositoryHealth: "EXCELLENT" | "AVERAGE" | "POOR";
}

/**
 * Represents the AI Brain's analysis and sentiment assessment.
 */
export interface IncidentAnalysis {
  targetId: string;
  incidentType: "DEPENDENCY" | "OUTAGE" | "EXPLOIT";
  severity: "HIGH" | "MEDIUM" | "LOW";
  sentiment: "FRUSTRATED" | "STALLED" | "ACTIVE";
  daysStagnant: number;
  confidence: number;
}

/**
 * Represents the risk score, recommendation, and required operational action.
 */
export interface RiskResult {
  probability: number;
  confidence: number;
  catastrophic: boolean;
  recommendation: "IGNORE" | "MONITOR" | "ALERT" | "SHORT";
  action: "NONE" | "POLL" | "WARN" | "EXECUTE";
}

/**
 * Represents the execution result of prediction market actions on Bento.
 */
export interface TransactionResult {
  transactionHash: string;
  timestamp: string;
  creditsUsed: number;
  marketId: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
}

/**
 * Represents the scheduler execution and drift statistics.
 */
export interface SchedulerState {
  lastRun: string;
  driftMs: number;
  executionTimeMs: number;
  status: "RUNNING" | "PAUSED";
}

/**
 * Represents the application health metrics and diagnostics.
 */
export interface HealthStatus {
  mode: "LIVE" | "HYBRID" | "SIMULATION";
  uptimeMs: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
  apiSuccessRate: number;
  apiFailureRate: number;
  // ChatGPT Specific Metrics
  totalAiRequests: number;
  successfulAiRequests: number;
  failedAiRequests: number;
  avgAiLatencyMs: number;
  totalTokensUsed: number;
  estimatedAiCostUsd: number;
}

/**
 * Interface for collecting engineering signals.
 */
export interface EvidenceProvider {
  collectEvidence(target: string): Promise<Evidence>;
}

/**
 * Interface for performing AI sentiment analysis on collected signals.
 */
export interface AnalysisProvider {
  analyze(evidence: Evidence): Promise<IncidentAnalysis>;
}

/**
 * Interface for calculating operational risk from analyses.
 */
export interface RiskCalculator {
  calculate(analysis: IncidentAnalysis, evidence: Evidence): RiskResult;
}

/**
 * Interface for executing prediction market actions.
 */
export interface MarketExecutor {
  executeTrade(target: string, incidentType: string, result: RiskResult): Promise<TransactionResult>;
}

/**
 * Interface for local persistence of app state and history.
 */
export interface StorageProvider {
  saveIncident(incident: IncidentAnalysis): Promise<void>;
  saveRisk(result: RiskResult): Promise<void>;
  saveTransaction(tx: TransactionResult): Promise<void>;
  saveSchedulerState(state: SchedulerState): Promise<void>;
  saveHealth(health: HealthStatus): Promise<void>;
  hasMarketBeenExecuted(targetId: string): Promise<boolean>;
  markMarketExecuted(targetId: string, txHash: string): Promise<void>;
}
