import { SchedulerState } from '../core/interfaces.js';
import { logger } from '../utils/logger.js';

/**
 * Drift-compensated scheduler class that runs a periodic job.
 * Avoids setInterval, measures execution time, and corrects for timer drift.
 */
export class DriftScheduler {
  private isRunning = false;
  private readonly intervalMs: number;
  private expectedNextRunTime = 0;
  private timerId: NodeJS.Timeout | null = null;
  private lastDriftMs = 0;
  private lastExecutionTimeMs = 0;
  private lastRunTimestamp = '';

  constructor(
    private readonly job: () => Promise<void>,
    intervalMs = 60000
  ) {
    this.intervalMs = intervalMs;
  }

  /**
   * Starts the scheduler loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.expectedNextRunTime = Date.now();
    this.lastRunTimestamp = new Date().toISOString();
    logger.info('Scheduler', `Drift-compensated scheduler initialized. Interval: ${this.intervalMs}ms`);
    this.tick();
  }

  /**
   * Stops the scheduler loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    logger.info('Scheduler', 'Drift-compensated scheduler stopped.');
  }

  /**
   * Executes a single tick.
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    const now = Date.now();
    const drift = now - this.expectedNextRunTime;
    this.lastDriftMs = drift;
    this.lastRunTimestamp = new Date().toISOString();

    if (drift > 100) {
      logger.warn(
        'Scheduler',
        `Clock drift exceeded 100ms limit: ${drift}ms. Automatically resynchronizing.`
      );
    } else {
      logger.debug('Scheduler', `Execution drift: ${drift}ms`);
    }

    const startTime = Date.now();
    try {
      await this.job();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Scheduler', `Job execution error: ${errorMessage}`);
    } finally {
      this.lastExecutionTimeMs = Date.now() - startTime;
      logger.debug('Scheduler', `Job executed in ${this.lastExecutionTimeMs}ms`);
      this.scheduleNextTick();
    }
  }

  /**
   * Schedules the next tick corrected for drift.
   */
  private scheduleNextTick(): void {
    if (!this.isRunning) return;

    this.expectedNextRunTime += this.intervalMs;
    const now = Date.now();
    let delay = this.expectedNextRunTime - now;

    // Resynchronize if execution time exceeded the interval
    if (delay <= 0) {
      logger.warn(
        'Scheduler',
        `Job execution duration exceeded polling interval. Rescheduling next run instantly.`
      );
      this.expectedNextRunTime = now + this.intervalMs;
      delay = this.intervalMs;
    }

    this.timerId = setTimeout(() => {
      this.tick();
    }, delay);
  }

  /**
   * Retrieves the current scheduler state metrics.
   */
  public getState(): SchedulerState {
    return {
      lastRun: this.lastRunTimestamp,
      driftMs: this.lastDriftMs,
      executionTimeMs: this.lastExecutionTimeMs,
      status: this.isRunning ? 'RUNNING' : 'PAUSED',
    };
  }
}
