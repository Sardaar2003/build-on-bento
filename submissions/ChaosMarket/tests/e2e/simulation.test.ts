import fs from 'fs/promises';
import { incidentSimulator } from '../../src/simulator/incidentSimulator.js';
import { anakinAdapter } from '../../src/infrastructure/anakinAdapter.js';
import { brainAdapter } from '../../src/infrastructure/chatGptProvider.js';
import { riskEngine } from '../../src/core/riskEngine.js';
import { decisionEngine } from '../../src/core/decisionEngine.js';
import { bentoAdapter } from '../../src/infrastructure/bentoAdapter.js';
import { StorageAdapter } from '../../src/infrastructure/storageAdapter.js';
import { config } from '../../src/config/env.js';

describe('SRE ChaosMarket End-to-End Simulation Tracks', () => {
  const tempDbDir = './data_e2e';
  const target = 'facebook/react';
  let storageAdapter: StorageAdapter;

  beforeAll(async () => {
    config.mode = 'SIMULATION';
    await fs.mkdir(tempDbDir, { recursive: true });
    storageAdapter = new StorageAdapter(tempDbDir);
  });

  afterAll(async () => {
    incidentSimulator.clearSimulation();
    await fs.rm(tempDbDir, { recursive: true, force: true });
  });

  test('Track A: Open Source Dependency Collapse E2E Pipeline', async () => {
    // 1. Trigger simulated Dependency Collapse signals
    incidentSimulator.simulateDependencyFailure(target);

    // 2. Fetch Evidence
    const evidence = await anakinAdapter.collectEvidence(target);
    expect(evidence.repositoryHealth).toBe('POOR');
    expect(evidence.commitFrequencyPerWeek).toBe(0);

    // 3. AI Sentiment Analysis
    const analysis = await brainAdapter.analyze(evidence);
    expect(analysis.incidentType).toBe('DEPENDENCY');
    expect(analysis.sentiment).toBe('FRUSTRATED');
    expect(analysis.daysStagnant).toBe(18);

    // 4. Mathematical Risk engine calculation
    const rawRisk = riskEngine.calculate(analysis, evidence);
    const evaluatedRisk = decisionEngine.evaluate(rawRisk);

    expect(evaluatedRisk.probability).toBeGreaterThanOrEqual(0.75);
    expect(evaluatedRisk.recommendation).toBe('SHORT');
    expect(evaluatedRisk.action).toBe('EXECUTE');
    expect(evaluatedRisk.catastrophic).toBe(true);

    // 5. Bento Hedging Execution
    const tradeResult = await bentoAdapter.executeTrade(target, analysis.incidentType, evaluatedRisk);
    expect(tradeResult.status).toBe('SUCCESS');
    expect(tradeResult.transactionHash).toBeDefined();

    // 6. DB Storage logs committing
    await storageAdapter.saveIncident(analysis);
    await storageAdapter.saveRisk(evaluatedRisk);
    await storageAdapter.saveTransaction(tradeResult);
  });

  test('Track B: Cloud Provider Outage E2E Pipeline', async () => {
    // 1. Ingest simulated Cloud Outage signals
    incidentSimulator.simulateCloudOutage(target);

    // 2. Collect evidence signals
    const evidence = await anakinAdapter.collectEvidence(target);
    expect(evidence.issueVelocity).toBe('HIGH');
    expect(evidence.openIssueCount).toBe(210);

    // 3. Execute analysis
    const analysis = await brainAdapter.analyze(evidence);
    expect(analysis.incidentType).toBe('OUTAGE');
    expect(analysis.severity).toBe('HIGH');

    // 4. Calculate Risk scores
    const rawRisk = riskEngine.calculate(analysis, evidence);
    const evaluatedRisk = decisionEngine.evaluate(rawRisk);

    expect(evaluatedRisk.probability).toBeGreaterThanOrEqual(0.75);
    expect(evaluatedRisk.recommendation).toBe('SHORT');
    expect(evaluatedRisk.action).toBe('EXECUTE');

    // 5. Place automated prediction trades
    const tradeResult = await bentoAdapter.executeTrade(target, analysis.incidentType, evaluatedRisk);
    expect(tradeResult.status).toBe('SUCCESS');
  });

  test('Track C: Smart Contract Exploit E2E Pipeline', async () => {
    // 1. Ingest simulated Exploit signals
    incidentSimulator.simulateExploit(target);

    // 2. Fetch signals
    const evidence = await anakinAdapter.collectEvidence(target);
    expect(evidence.securityAdvisories).toBe('CRITICAL');

    // 3. Brain Analysis
    const analysis = await brainAdapter.analyze(evidence);
    expect(analysis.incidentType).toBe('EXPLOIT');

    // 4. Compute risk
    const rawRisk = riskEngine.calculate(analysis, evidence);
    const evaluatedRisk = decisionEngine.evaluate(rawRisk);

    expect(evaluatedRisk.probability).toBeGreaterThanOrEqual(0.75);
    expect(evaluatedRisk.recommendation).toBe('SHORT');
    expect(evaluatedRisk.action).toBe('EXECUTE');

    // 5. Place trade
    const tradeResult = await bentoAdapter.executeTrade(target, analysis.incidentType, evaluatedRisk);
    expect(tradeResult.status).toBe('SUCCESS');
  });
});
