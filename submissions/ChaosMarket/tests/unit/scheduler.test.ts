import { jest } from '@jest/globals';
import { DriftScheduler } from '../../src/scheduler/driftScheduler.js';

describe('DriftScheduler Polling Loops', () => {
  beforeEach(() => {
    // Enable fake timers before each test
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clean up timers to prevent side-effects in other tests
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('Should execute SRE polling job and report state', async () => {
    let jobExecutionCount = 0;
    const job = async () => {
      jobExecutionCount++;
    };

    const scheduler = new DriftScheduler(job, 20);
    scheduler.start();

    // Instantly fast-forward time by 75ms.
    // If your scheduler awaits the job internally, use advanceTimersByTimeAsync
    await jest.advanceTimersByTimeAsync(75);

    scheduler.stop();

    expect(jobExecutionCount).toBeGreaterThanOrEqual(3);

    const state = scheduler.getState();
    expect(state.status).toBe('PAUSED');
    expect(state.driftMs).toBeDefined();
    expect(state.executionTimeMs).toBeDefined();
  });
});