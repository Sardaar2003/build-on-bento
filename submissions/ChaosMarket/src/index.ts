import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { anakinAdapter } from './infrastructure/anakinAdapter.js';
import {
  brainAdapter,
  totalAiRequests,
  successfulAiRequests,
  failedAiRequests,
  totalAiLatencyMs,
  totalTokensUsed,
  estimatedAiCostUsd,
} from './infrastructure/chatGptProvider.js';
import { riskEngine } from './core/riskEngine.js';
import { decisionEngine } from './core/decisionEngine.js';
import { bentoAdapter } from './infrastructure/bentoAdapter.js';
import { storageAdapter } from './infrastructure/storageAdapter.js';
import { incidentSimulator } from './simulator/incidentSimulator.js';
import { DriftScheduler } from './scheduler/driftScheduler.js';
import { terminalDashboard, PerformanceMetrics } from './dashboard/terminalDashboard.js';
import { Evidence, IncidentAnalysis, RiskResult, TransactionResult, HealthStatus, SchedulerState, EvidenceProvider, AnalysisProvider, RiskCalculator, MarketExecutor, StorageProvider } from './core/interfaces.js';

// Global state trackers
const appStartTime = Date.now();
let currentStep: 'IDLE' | 'CRAWLING' | 'PARSING' | 'CALCULATING' | 'EXECUTING' | 'COMPLETED' | 'ERROR' = 'IDLE';

let lastEvidence: Evidence | null = null;
let lastAnalysis: IncidentAnalysis | null = null;
let lastRisk: RiskResult | null = null;
let lastTx: TransactionResult | null = null;

let apiCallsCount = 0;
let apiFailuresCount = 0;

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

const performanceMetrics: PerformanceMetrics = {
  anakinMs: 0,
  brainMs: 0,
  riskMs: 0,
  storageMs: 0,
  bentoMs: 0,
  totalMs: 0,
};

let simCycleIndex = 0;

/**
 * Computes CPU load percentage since last call.
 */
function getCpuUsagePercent(): number {
  const currentCpuUsage = process.cpuUsage();
  const currentCpuTime = Date.now();

  const userMs = (currentCpuUsage.user - lastCpuUsage.user) / 1000;
  const systemMs = (currentCpuUsage.system - lastCpuUsage.system) / 1000;
  const elapsedMs = currentCpuTime - lastCpuTime;

  lastCpuUsage = currentCpuUsage;
  lastCpuTime = currentCpuTime;

  if (elapsedMs === 0) return 0;
  const percent = ((userMs + systemMs) / elapsedMs) * 100;
  return Math.max(0, Math.min(100, percent));
}

/**
 * Gathers SRE health diagnostics and logs them to storage.
 */
async function gatherHealthStatus(schedulerState: SchedulerState): Promise<HealthStatus> {
  const memoryUsageMb = process.memoryUsage().rss / 1024 / 1024;
  const cpuUsagePercent = getCpuUsagePercent();
  const apiSuccessRate = apiCallsCount > 0 ? (apiCallsCount - apiFailuresCount) / apiCallsCount : 1.0;

  const avgAiLatencyMs = totalAiRequests > 0 ? totalAiLatencyMs / totalAiRequests : 0;

  const health: HealthStatus = {
    mode: config.mode,
    uptimeMs: Date.now() - appStartTime,
    memoryUsageMb,
    cpuUsagePercent,
    apiSuccessRate,
    apiFailureRate: 1.0 - apiSuccessRate,
    // ChatGPT Specific Metrics
    totalAiRequests,
    successfulAiRequests,
    failedAiRequests,
    avgAiLatencyMs,
    totalTokensUsed,
    estimatedAiCostUsd,
  };

  try {
    await storageAdapter.saveHealth(health);
    await storageAdapter.saveSchedulerState(schedulerState);
  } catch (error) {
    logger.warn('Bootstrap', `Failed to persist health metrics: ${error instanceof Error ? error.message : String(error)}`);
  }

  return health;
}

/**
 * Standard trigger cycle for SRE simulation tracks.
 */
function triggerSimulationCycle(): void {
  if (config.mode !== 'SIMULATION') return;

  if (config.simulationType === 'DEPENDENCY') {
    incidentSimulator.simulateDependencyFailure(config.targetRepo);
  } else if (config.simulationType === 'OUTAGE') {
    incidentSimulator.simulateCloudOutage(config.targetRepo);
  } else if (config.simulationType === 'EXPLOIT') {
    incidentSimulator.simulateExploit(config.targetRepo);
  } else {
    // ALL mode: Cycle failure tracks sequentially
    const tracks = ['DEPENDENCY', 'OUTAGE', 'EXPLOIT'];
    const currentTrack = tracks[simCycleIndex % tracks.length];
    simCycleIndex++;

    if (currentTrack === 'DEPENDENCY') {
      incidentSimulator.simulateDependencyFailure(config.targetRepo);
    } else if (currentTrack === 'OUTAGE') {
      incidentSimulator.simulateCloudOutage(config.targetRepo);
    } else if (currentTrack === 'EXPLOIT') {
      incidentSimulator.simulateExploit(config.targetRepo);
    }
  }
}

/**
 * Clears terminal dashboard and issues a fresh redraw of the control board.
 */
async function redrawDashboard(schedulerState: SchedulerState): Promise<void> {
  const health = await gatherHealthStatus(schedulerState);
  terminalDashboard.render(
    config.mode,
    config.targetRepo,
    currentStep,
    lastEvidence,
    lastAnalysis,
    lastRisk,
    lastTx,
    performanceMetrics,
    schedulerState,
    health
  );
}

export class ChaosMarketEngine {
  private scheduler: DriftScheduler | null = null;

  constructor(
    private evidenceProvider: EvidenceProvider,
    private analysisProvider: AnalysisProvider,
    private riskCalculator: RiskCalculator,
    private marketExecutor: MarketExecutor,
    private storage: StorageProvider
  ) {}

  /**
   * Main execution step for SRE ingestion, calculation, and hedging.
   */
  public async executeTick(): Promise<void> {
    const pipelineStart = Date.now();
    lastTx = null; // Clear transaction result from previous tick

    // 1. Simulation Override Check
    triggerSimulationCycle();

    // 2. Crawl Signals
    currentStep = 'CRAWLING';
    logger.custom('ANAKIN', '🔍 Initiating evidence collection sweep...');
    terminalDashboard.addLog('Anakin API', 'CRAWLING', `Starting evidence collection for target ${config.targetRepo}`);
    let stepStart = Date.now();
    try {
      apiCallsCount++;
      lastEvidence = await this.evidenceProvider.collectEvidence(config.targetRepo);
      performanceMetrics.anakinMs = Date.now() - stepStart;
      terminalDashboard.addLog('Anakin API', 'SUCCESS', `Crawling complete in ${performanceMetrics.anakinMs}ms`);
    } catch (error) {
      apiFailuresCount++;
      performanceMetrics.anakinMs = Date.now() - stepStart;
      currentStep = 'ERROR';
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Bootstrap', `Execution loop failure: Crawling failed: ${msg}`);
      terminalDashboard.addLog('Anakin API', 'ERROR', `Crawling failed: ${msg}`);
      return;
    }

    // 3. AI Brain Parser
    currentStep = 'PARSING';
    logger.custom('BRAIN', '🧠 Analyzing operational text and sentiment streams...');
    terminalDashboard.addLog('AI Brain', 'PARSING', `Parsing developer conversations and stagnation logs`);
    stepStart = Date.now();
    try {
      apiCallsCount++;
      lastAnalysis = await this.analysisProvider.analyze(lastEvidence);
      performanceMetrics.brainMs = Date.now() - stepStart;
      await this.storage.saveIncident(lastAnalysis);
      terminalDashboard.addLog(
        'AI Brain',
        'SUCCESS',
        `Parsing complete in ${performanceMetrics.brainMs}ms (sentiment: ${lastAnalysis.sentiment}, stagnant: ${lastAnalysis.daysStagnant}d)`
      );
    } catch (error) {
      apiFailuresCount++;
      performanceMetrics.brainMs = Date.now() - stepStart;
      currentStep = 'ERROR';
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Bootstrap', `Execution loop failure: Brain analysis failed: ${msg}`);
      terminalDashboard.addLog('AI Brain', 'ERROR', `Brain analysis failed: ${msg}`);
      return;
    }

    // 4. Mathematical Risk Calculation
    currentStep = 'CALCULATING';
    logger.custom('RISK', '⚠️ Recomputing infrastructure fragility matrix...');
    terminalDashboard.addLog('Risk Engine', 'CALCULATING', `Evaluating mathematical risk formulas`);
    stepStart = Date.now();
    try {
      const rawRisk = this.riskCalculator.calculate(lastAnalysis, lastEvidence);
      lastRisk = decisionEngine.evaluate(rawRisk);
      performanceMetrics.riskMs = Date.now() - stepStart;
      await this.storage.saveRisk(lastRisk);
      terminalDashboard.addLog(
        'Risk Engine',
        'SUCCESS',
        `Risk calculated: ${(lastRisk.probability * 100).toFixed(1)}% (rec: ${lastRisk.recommendation}, action: ${lastRisk.action})`
      );
    } catch (error) {
      performanceMetrics.riskMs = Date.now() - stepStart;
      currentStep = 'ERROR';
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Bootstrap', `Execution loop failure: Risk calculations failed: ${msg}`);
      terminalDashboard.addLog('Risk Engine', 'ERROR', `Risk calculations failed: ${msg}`);
      return;
    }

    // 5. Prediction Hedging (Bento SDK Trade)
    if (lastRisk.action === 'EXECUTE' && lastAnalysis.confidence >= 0.80) {
      currentStep = 'EXECUTING';
      stepStart = Date.now();
      try {
        const alreadyExecuted = await this.storage.hasMarketBeenExecuted(lastAnalysis.targetId);
        if (alreadyExecuted) {
          performanceMetrics.bentoMs = Date.now() - stepStart;
          logger.custom('BENTO', `🛡️ Market for ${lastAnalysis.targetId} already exists. Skipping duplicate execution.`);
          terminalDashboard.addLog('Bento SDK', 'WARN', `🛡️ Market for ${lastAnalysis.targetId} already exists. Skipping duplicate execution.`);
        } else {
          logger.custom('BENTO', '🚀 High Fragility Alert! Executing on-chain hedge...');
          terminalDashboard.addLog('Bento SDK', 'EXECUTING', `Probability threshold breached. Placing automated Bento market hedge.`);
          apiCallsCount++;
          lastTx = await this.marketExecutor.executeTrade(config.targetRepo, lastAnalysis.incidentType, lastRisk);
          performanceMetrics.bentoMs = Date.now() - stepStart;
          if (lastTx.status === 'SUCCESS') {
            await this.storage.saveTransaction(lastTx);
            await this.storage.markMarketExecuted(lastAnalysis.targetId, lastTx.transactionHash);
            terminalDashboard.addLog('Bento SDK', 'SUCCESS', `Hedge complete (Tx: ${lastTx.transactionHash.substring(0, 10)}...)`);
          } else {
            apiFailuresCount++;
            terminalDashboard.addLog('Bento SDK', 'ERROR', `Hedge execution failed: ${lastTx.error}`);
          }
        }
      } catch (error) {
        apiFailuresCount++;
        performanceMetrics.bentoMs = Date.now() - stepStart;
        currentStep = 'ERROR';
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Bootstrap', `Execution loop failure: Hedge transaction error: ${msg}`);
        terminalDashboard.addLog('Bento SDK', 'ERROR', `Hedge transaction error: ${msg}`);
        return;
      }
    } else if (lastRisk.action === 'EXECUTE' && lastAnalysis.confidence < 0.80) {
      performanceMetrics.bentoMs = 0;
      logger.warn('Bootstrap', `SHORT recommended, but execution blocked due to low confidence (${lastAnalysis.confidence})`);
      terminalDashboard.addLog('Bento SDK', 'WARN', `Execution blocked due to low confidence (${lastAnalysis.confidence})`);
    } else {
      performanceMetrics.bentoMs = 0;
    }

    performanceMetrics.totalMs = Date.now() - pipelineStart;
    currentStep = 'COMPLETED';
  }

  public async start(): Promise<void> {
    logger.info('Bootstrap', `Starting ChaosMarket Engine in [${config.mode}] mode...`);

    // Set up the scheduler
    this.scheduler = new DriftScheduler(async () => {
      const startTime = Date.now();
      await this.executeTick();
      await redrawDashboard(this.scheduler!.getState());

      const executionTimeMs = Date.now() - startTime;
      await this.storage.saveSchedulerState({
        lastRun: new Date().toISOString(),
        driftMs: this.scheduler!.getState().driftMs,
        executionTimeMs,
        status: 'RUNNING',
      });
    }, config.POLL_INTERVAL);

    // Initial runs
    const startTime = Date.now();
    await this.executeTick();
    await redrawDashboard(this.scheduler.getState());

    const executionTimeMs = Date.now() - startTime;
    await this.storage.saveSchedulerState({
      lastRun: new Date().toISOString(),
      driftMs: 0,
      executionTimeMs,
      status: 'RUNNING',
    });

    this.scheduler.start();
  }

  public stop(): void {
    if (this.scheduler) {
      this.scheduler.stop();
    }
  }

  public getSchedulerState(): SchedulerState {
    return this.scheduler
      ? this.scheduler.getState()
      : { lastRun: '', driftMs: 0, executionTimeMs: 0, status: 'PAUSED' };
  }
}

// Bootstrap main process
async function bootstrap() {
  const engine = new ChaosMarketEngine(
    anakinAdapter,
    brainAdapter,
    riskEngine,
    bentoAdapter,
    storageAdapter
  );

  logger.info('Bootstrap', `Booting ChaosMarket engine in ${config.mode} mode for target ${config.targetRepo}`);

  // Handle instant SRE health checks
  if (config.isHealthCheck) {
    logger.info('Bootstrap', 'Executing automated system healthcheck run.');
    await engine.executeTick();
    const tempState: SchedulerState = {
      lastRun: new Date().toISOString(),
      driftMs: 0,
      executionTimeMs: performanceMetrics.totalMs,
      status: 'PAUSED',
    };
    await gatherHealthStatus(tempState);

    if (currentStep === 'COMPLETED') {
      logger.success('Bootstrap', 'Healthcheck run completed successfully.');
      process.exit(0);
    } else {
      logger.error('Bootstrap', 'Healthcheck run failed with pipeline errors.');
      process.exit(1);
    }
  }

  // Start the engine
  await engine.start();

  // Handle clean shutdown
  const shutdown = async (signal: string) => {
    logger.info('Bootstrap', `Received shutdown signal: ${signal}. Terminating SRE monitors.`);
    engine.stop();
    
    // Save final status records
    const finalState = engine.getSchedulerState();
    await gatherHealthStatus(finalState);
    
    logger.success('Bootstrap', 'ChaosMarket terminated cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run bootstrap process
bootstrap().catch((err) => {
  logger.error('Bootstrap', `Fatal crash during SRE engine boot: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
