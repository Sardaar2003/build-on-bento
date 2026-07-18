import { logger } from '../utils/logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

/**
 * A generic Circuit Breaker implementation to protect external service calls.
 * Transitions between CLOSED, OPEN, and HALF-OPEN based on failure rates.
 */
export class CircuitBreaker<T, Args extends unknown[]> {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private consecutiveSuccessCount = 0;
  private lastStateChange: number = Date.now();

  constructor(
    private readonly actionName: string,
    private readonly request: (...args: Args) => Promise<T>,
    private readonly fallback: (...args: Args) => Promise<T>,
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 15000
  ) {}

  /**
   * Executes the request if the circuit is CLOSED or HALF-OPEN,
   * otherwise immediately invokes the fallback function.
   */
  public async execute(...args: Args): Promise<T> {
    this.checkCooldown();

    if (this.state === 'OPEN') {
      logger.warn(
        'CircuitBreaker',
        `Circuit for "${this.actionName}" is OPEN. Bypassing request to fallback mode.`
      );
      return this.fallback(...args);
    }

    try {
      const result = await this.request(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      // If the failure caused the circuit to trip to OPEN, immediately use fallback
      if ((this.state as CircuitState) === 'OPEN') {
        logger.warn(
          'CircuitBreaker',
          `Circuit for "${this.actionName}" tripped to OPEN. Switching to fallback.`
        );
        return this.fallback(...args);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF-OPEN') {
      this.consecutiveSuccessCount++;
      if (this.consecutiveSuccessCount >= 1) {
        this.transitionTo('CLOSED');
      }
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.consecutiveSuccessCount = 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      'CircuitBreaker',
      `Execution failure in "${this.actionName}" (${this.failureCount}/${this.failureThreshold}): ${errorMessage}`
    );

    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private checkCooldown(): void {
    if (this.state === 'OPEN' && Date.now() - this.lastStateChange > this.cooldownMs) {
      this.transitionTo('HALF-OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    logger.info(
      'CircuitBreaker',
      `Circuit State Change [${this.actionName}]: ${this.state} -> ${newState}`
    );
    this.state = newState;
    this.lastStateChange = Date.now();
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.consecutiveSuccessCount = 0;
    }
  }

  /**
   * Retrieves the current state of the circuit breaker.
   */
  public getState(): CircuitState {
    this.checkCooldown();
    return this.state;
  }
}
