import { logger } from './logger.js';
import { timer } from './timer.js';

/**
 * Executes an async function with the specified backoff retry strategy.
 * Strategy:
 * - Attempt 1: Run immediately. If fails:
 * - Wait 1000ms.
 * - Attempt 2: Run. If fails:
 * - Wait 2000ms.
 * - Attempt 3: Run. If fails:
 * - Wait 4000ms.
 * - Fail gracefully by throwing the final error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  component: string,
  operationDescription: string
): Promise<T> {
  const delays = [1000, 2000, 4000];
  let attempt = 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt > delays.length;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        logger.error(
          component,
          `Operation "${operationDescription}" failed on final attempt ${attempt}. Error: ${errorMessage}`
        );
        throw error;
      }

      const nextDelay = delays[attempt - 1];
      logger.warn(
        component,
        `Attempt ${attempt} of "${operationDescription}" failed: ${errorMessage}. Retrying in ${nextDelay}ms...`
      );

      await timer(nextDelay);
      attempt++;
    }
  }
}
