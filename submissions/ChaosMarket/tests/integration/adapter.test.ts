import fs from 'fs/promises';
import path from 'path';
import { AnakinAdapter } from '../../src/infrastructure/anakinAdapter.js';
import { ChatGptProvider } from '../../src/infrastructure/chatGptProvider.js';
import { BentoAdapter } from '../../src/infrastructure/bentoAdapter.js';
import { StorageAdapter } from '../../src/infrastructure/storageAdapter.js';
import { Evidence } from '../../src/core/interfaces.js';
import { config } from '../../src/config/env.js';

describe('SRE Adapter Integration Tests', () => {
  const tempDbDir = './data_test';
  let storageAdapter: StorageAdapter;
  let anakinAdapter: AnakinAdapter;
  let brainAdapter: ChatGptProvider;
  let bentoAdapter: BentoAdapter;

  beforeAll(async () => {
    config.mode = 'SIMULATION';
    await fs.mkdir(tempDbDir, { recursive: true });
    storageAdapter = new StorageAdapter(tempDbDir);
    anakinAdapter = new AnakinAdapter();
    brainAdapter = new ChatGptProvider();
    bentoAdapter = new BentoAdapter();
  });

  afterAll(async () => {
    // Clean up temporary test database folder
    await fs.rm(tempDbDir, { recursive: true, force: true });
  });

  test('AnakinAdapter and BrainAdapter should resolve normal signals heuristically', async () => {
    const evidence = await anakinAdapter.collectEvidence('facebook/react');
    expect(evidence.targetId).toBe('facebook/react');
    expect(evidence.repositoryHealth).toBe('EXCELLENT');

    const analysis = await brainAdapter.analyze(evidence);
    expect(analysis.targetId).toBe('facebook/react');
    expect(analysis.incidentType).toBe('DEPENDENCY');
    expect(analysis.sentiment).toBe('ACTIVE');
    expect(analysis.daysStagnant).toBe(0);
  });

  test('BentoAdapter should intercept and execute mock trades', async () => {
    const mockRisk = {
      probability: 0.85,
      confidence: 0.9,
      catastrophic: true,
      recommendation: 'SHORT' as const,
      action: 'EXECUTE' as const,
    };

    const result = await bentoAdapter.executeTrade('facebook/react', 'DEPENDENCY', mockRisk);
    expect(result.status).toBe('SUCCESS');
    expect(result.transactionHash).toMatch(/^0x[0-9a-f]{40}$/);
    expect(result.marketId).toBeDefined();
    expect(result.creditsUsed).toBe(100);
  });

  test('StorageAdapter should append records to test database files', async () => {
    const mockAnalysis = {
      targetId: 'facebook/react',
      incidentType: 'DEPENDENCY' as const,
      severity: 'HIGH' as const,
      sentiment: 'FRUSTRATED' as const,
      daysStagnant: 18,
      confidence: 0.91,
    };

    await storageAdapter.saveIncident(mockAnalysis);

    const filePath = path.join(tempDbDir, 'incidents.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const records = JSON.parse(content);

    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(1);
    expect(records[0].targetId).toBe('facebook/react');
    expect(records[0].daysStagnant).toBe(18);
  });

  test('StorageAdapter should track market execution idempotency ledger', async () => {
    const target = 'facebook/react';
    const txHash = '0x1234567890abcdef1234567890abcdef12345678';

    // 1. Check initially not executed
    const initialCheck = await storageAdapter.hasMarketBeenExecuted(target);
    expect(initialCheck).toBe(false);

    // 2. Mark executed
    await storageAdapter.markMarketExecuted(target, txHash);

    // 3. Verify it is marked executed
    const secondCheck = await storageAdapter.hasMarketBeenExecuted(target);
    expect(secondCheck).toBe(true);

    // 4. Verify other target is not executed
    const otherCheck = await storageAdapter.hasMarketBeenExecuted('facebook/react-native');
    expect(otherCheck).toBe(false);
  });
});
