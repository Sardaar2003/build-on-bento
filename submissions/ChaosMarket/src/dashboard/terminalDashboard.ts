import chalk from 'chalk';
import Table from 'cli-table3';
import {
  Evidence,
  IncidentAnalysis,
  RiskResult,
  TransactionResult,
  SchedulerState,
  HealthStatus,
} from '../core/interfaces.js';

export interface PerformanceMetrics {
  anakinMs: number;
  brainMs: number;
  riskMs: number;
  storageMs: number;
  bentoMs: number;
  totalMs: number;
}

/**
 * Terminal UI Dashboard for SRE Operator room.
 * Visualizes system state, performance latencies, prediction trades, and OS health.
 */
export class TerminalDashboard {
  private activeLogs: string[] = [];

  /**
   * Adds an operational SRE event log to be shown at the bottom of the dashboard.
   */
  public addLog(step: string, status: string, detail: string): void {
    const time = new Date().toLocaleTimeString();
    let stepFormatted = step;
    let statusFormatted = status;

    if (status === 'SUCCESS' || status.includes('Complete')) {
      statusFormatted = chalk.bold.green(status);
      stepFormatted = chalk.cyan(step);
    } else if (status === 'ERROR' || status.includes('Failure')) {
      statusFormatted = chalk.bold.red(status);
      stepFormatted = chalk.red(step);
    } else if (status === 'WARN') {
      statusFormatted = chalk.bold.yellow(status);
    } else {
      statusFormatted = chalk.bold.blue(status);
      stepFormatted = chalk.gray(step);
    }

    this.activeLogs.push(`[${time}] ${stepFormatted} -> ${statusFormatted}: ${detail}`);
    if (this.activeLogs.length > 6) {
      this.activeLogs.shift();
    }
  }

  /**
   * Clears the console and draws the entire ChaosMarket control board.
   */
  public render(
    mode: 'LIVE' | 'HYBRID' | 'SIMULATION',
    target: string,
    currentStep: 'IDLE' | 'CRAWLING' | 'PARSING' | 'CALCULATING' | 'EXECUTING' | 'COMPLETED' | 'ERROR',
    evidence: Evidence | null,
    analysis: IncidentAnalysis | null,
    risk: RiskResult | null,
    tx: TransactionResult | null,
    performance: PerformanceMetrics,
    scheduler: SchedulerState,
    health: HealthStatus
  ): void {
    // Clear terminal screen
    process.stdout.write('\x1Bc');

    console.log(chalk.bold.yellow(`\n=== CHAOSMARKET CONTROL BOARD v2.0 ===`));
    console.log(
      chalk.gray(`SRE Monitor | Mode: `) +
      (mode === 'LIVE'
        ? chalk.bold.red(mode)
        : mode === 'HYBRID'
        ? chalk.bold.yellow(mode)
        : chalk.bold.cyan(mode)) +
      chalk.gray(` | Target: `) +
      chalk.bold.green(target) +
      chalk.gray(` | Status: `) +
      chalk.bold.magenta(currentStep)
    );

    // ChaosMarket Health Summary Matrix (Precisely as specified in Section 25.3)
    const summaryTable = new Table({
      head: [
        chalk.cyan('Engine Telemetry'),
        chalk.cyan('System Health Status'),
        chalk.cyan('On-Chain Operations'),
      ],
      colWidths: [35, 35, 35],
    });

    const targetVal = target;
    const incidentTypeVal = analysis ? analysis.incidentType : 'N/A';
    const fragilityVal = risk ? `${(risk.probability * 100).toFixed(1)}%` : 'N/A';

    const uptimeHrs = (health.uptimeMs / 1000 / 60 / 60).toFixed(4);
    const memoryVal = `${health.memoryUsageMb.toFixed(1)} MB`;
    const apiFailureRateVal = `${(health.apiFailureRate * 100).toFixed(1)}%`;

    const actionStrategy = risk ? (risk.action === 'EXECUTE' ? 'SHORT' : risk.action) : 'N/A';
    const txHashVal = tx ? tx.transactionHash : 'N/A';

    summaryTable.push(
      [
        `Target ID: ${targetVal}`,
        `Engine Uptime: ${uptimeHrs} hrs`,
        `Current Action Strategy: ${actionStrategy}`,
      ],
      [
        `Incident Type: ${incidentTypeVal}`,
        `Memory Allocation: ${memoryVal}`,
        `Active Contract TX Hash:`,
      ],
      [
        `Fragility Index (Prob): ${fragilityVal}`,
        `API Error Rate: ${apiFailureRateVal}`,
        `  ${txHashVal}`,
      ]
    );

    console.log(`\n` + chalk.bold(' ChaosMarket Health Summary Matrix'));
    console.log(summaryTable.toString());

    // Render Table 1: Core SRE Pipeline Metrics
    const pipelineTable = new Table({
      head: [
        chalk.cyan('Repository Health'),
        chalk.cyan('Open Issues'),
        chalk.cyan('Security Advisories'),
        chalk.cyan('AI Sentiment'),
        chalk.cyan('Stagnation Time'),
        chalk.cyan('Failure Prob.'),
      ],
      colWidths: [20, 15, 22, 16, 18, 16],
    });

    const repoHealthStr = evidence
      ? evidence.repositoryHealth === 'EXCELLENT'
        ? chalk.green(evidence.repositoryHealth)
        : evidence.repositoryHealth === 'AVERAGE'
        ? chalk.yellow(evidence.repositoryHealth)
        : chalk.red(evidence.repositoryHealth)
      : 'N/A';

    const advisoriesStr = evidence
      ? evidence.securityAdvisories === 'CRITICAL'
        ? chalk.bold.red(evidence.securityAdvisories)
        : evidence.securityAdvisories === 'HIGH'
        ? chalk.red(evidence.securityAdvisories)
        : evidence.securityAdvisories === 'MEDIUM'
        ? chalk.yellow(evidence.securityAdvisories)
        : chalk.green(evidence.securityAdvisories)
      : 'N/A';

    const sentimentStr = analysis
      ? analysis.sentiment === 'FRUSTRATED'
        ? chalk.bold.red(analysis.sentiment)
        : analysis.sentiment === 'STALLED'
        ? chalk.yellow(analysis.sentiment)
        : chalk.green(analysis.sentiment)
      : 'N/A';

    const probStr = risk
      ? risk.probability >= 0.75
        ? chalk.bold.red(`${(risk.probability * 100).toFixed(1)}%`)
        : risk.probability >= 0.60
        ? chalk.yellow(`${(risk.probability * 100).toFixed(1)}%`)
        : chalk.green(`${(risk.probability * 100).toFixed(1)}%`)
      : 'N/A';

    pipelineTable.push([
      repoHealthStr,
      evidence ? `${evidence.openIssueCount} (vel: ${evidence.issueVelocity})` : 'N/A',
      advisoriesStr,
      sentimentStr,
      analysis ? `${analysis.daysStagnant} days` : 'N/A',
      probStr,
    ]);

    console.log(`\n` + chalk.bold(' Pipeline Signals'));
    console.log(pipelineTable.toString());

    // Render Table 2: Decision Matrix & Prediction execution
    const decisionTable = new Table({
      head: [
        chalk.cyan('AI Confidence'),
        chalk.cyan('Recommendation'),
        chalk.cyan('Action Trigger'),
        chalk.cyan('Bento Market ID'),
        chalk.cyan('Bento Tx Hash'),
        chalk.cyan('Credits'),
      ],
      colWidths: [16, 18, 16, 18, 25, 12],
    });

    const confidenceStr = risk
      ? risk.confidence >= 0.80
        ? chalk.green(`${(risk.confidence * 100).toFixed(0)}%`)
        : risk.confidence >= 0.50
        ? chalk.yellow(`${(risk.confidence * 100).toFixed(0)}%`)
        : chalk.red(`${(risk.confidence * 100).toFixed(0)}%`)
      : 'N/A';

    const recStr = risk
      ? risk.recommendation === 'SHORT'
        ? chalk.bold.red(risk.recommendation)
        : risk.recommendation === 'ALERT'
        ? chalk.yellow(risk.recommendation)
        : risk.recommendation === 'MONITOR'
        ? chalk.blue(risk.recommendation)
        : chalk.green(risk.recommendation)
      : 'N/A';

    const actionStr = risk
      ? risk.action === 'EXECUTE'
        ? chalk.bold.red(risk.action)
        : risk.action === 'WARN'
        ? chalk.yellow(risk.action)
        : risk.action === 'POLL'
        ? chalk.blue(risk.action)
        : chalk.green(risk.action)
      : 'N/A';

    decisionTable.push([
      confidenceStr,
      recStr,
      actionStr,
      tx ? tx.marketId : 'N/A',
      tx ? tx.transactionHash.substring(0, 22) + '...' : 'N/A',
      tx ? chalk.yellow(tx.creditsUsed) : 'N/A',
    ]);

    console.log(`\n` + chalk.bold(' Risk Engine Evaluation & Trade Status'));
    console.log(decisionTable.toString());

    // Render Table 3: Pipeline Performance Latency
    const perfTable = new Table({
      head: [
        chalk.cyan('Anakin Crawling'),
        chalk.cyan('AI Brain Parsing'),
        chalk.cyan('Risk calculation'),
        chalk.cyan('Storage persistence'),
        chalk.cyan('Bento Execution'),
        chalk.cyan('Total Latency'),
      ],
      colWidths: [18, 18, 18, 20, 18, 17],
    });

    perfTable.push([
      `${performance.anakinMs} ms`,
      `${performance.brainMs} ms`,
      `${performance.riskMs} ms`,
      `${performance.storageMs} ms`,
      `${performance.bentoMs} ms`,
      chalk.bold(`${performance.totalMs} ms`),
    ]);

    console.log(`\n` + chalk.bold(' Pipeline Performance & Latency'));
    console.log(perfTable.toString());

    // Render Table 4: Health Diagnostics & Scheduler
    const healthTable = new Table({
      head: [
        chalk.cyan('System Uptime'),
        chalk.cyan('Memory Footprint'),
        chalk.cyan('CPU Load'),
        chalk.cyan('Scheduler status'),
        chalk.cyan('Scheduler Drift'),
        chalk.cyan('API Success Rate'),
      ],
      colWidths: [16, 18, 12, 18, 18, 18],
    });

    const driftColor = scheduler.driftMs > 100 ? chalk.red : scheduler.driftMs > 50 ? chalk.yellow : chalk.green;
    const successColor = health.apiSuccessRate > 0.95 ? chalk.green : health.apiSuccessRate > 0.8 ? chalk.yellow : chalk.red;

    healthTable.push([
      `${uptimeHrs} hrs`,
      `${health.memoryUsageMb.toFixed(1)} MB`,
      `${health.cpuUsagePercent.toFixed(1)}%`,
      scheduler.status === 'RUNNING' ? chalk.green(scheduler.status) : chalk.yellow(scheduler.status),
      driftColor(`${scheduler.driftMs.toFixed(1)} ms`),
      successColor(`${(health.apiSuccessRate * 100).toFixed(1)}%`),
    ]);

    console.log(`\n` + chalk.bold(' System Health Monitor'));
    console.log(healthTable.toString());

    // Render Table 5: ChatGPT API Usage & Cost Statistics
    const aiUsageTable = new Table({
      head: [
        chalk.cyan('Total Requests'),
        chalk.cyan('Success / Failed'),
        chalk.cyan('Avg AI Latency'),
        chalk.cyan('Total Tokens Used'),
        chalk.cyan('Estimated Cost (USD)'),
      ],
      colWidths: [18, 20, 18, 22, 22],
    });

    aiUsageTable.push([
      health.totalAiRequests,
      `${chalk.green(health.successfulAiRequests)} / ${health.failedAiRequests > 0 ? chalk.red(health.failedAiRequests) : health.failedAiRequests}`,
      `${health.avgAiLatencyMs.toFixed(1)} ms`,
      health.totalTokensUsed.toLocaleString(),
      chalk.yellow(`$${health.estimatedAiCostUsd.toFixed(6)}`),
    ]);

    console.log(`\n` + chalk.bold(' ChatGPT API Usage & Cost Statistics'));
    console.log(aiUsageTable.toString());

    // SRE Output Stream logs
    console.log(`\n` + chalk.bold(' Live SRE Logging Stream'));
    if (this.activeLogs.length === 0) {
      console.log(chalk.gray('  No event logs generated yet. Waiting for next scheduler tick...'));
    } else {
      this.activeLogs.forEach((log) => console.log(`  ${log}`));
    }

    console.log(`\n` + chalk.gray(`Press Ctrl+C to terminate ChaosMarket.`));
  }
}

export const terminalDashboard = new TerminalDashboard();
