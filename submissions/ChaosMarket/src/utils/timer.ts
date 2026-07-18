/**
 * Returns a promise that resolves after the specified number of milliseconds.
 */
export function timer(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
