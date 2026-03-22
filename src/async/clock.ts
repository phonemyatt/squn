/**
 * Tracks wall-clock elapsed time for a transaction.
 * Each child query receives at most the remaining budget.
 */
export class TransactionClock {
  private readonly startedAt: number;

  constructor() {
    this.startedAt = Date.now();
  }

  /** Milliseconds elapsed since the clock started. */
  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * Milliseconds remaining in the budget, or null if no budget applies.
   * Returns 0 (not negative) when the budget is exhausted.
   */
  remaining(budgetMs: number): number | null {
    if (budgetMs <= 0) return null;
    return Math.max(0, budgetMs - this.elapsed());
  }

  /** True if the elapsed time has exceeded the budget. */
  expired(budgetMs: number): boolean {
    if (budgetMs <= 0) return false;
    return this.elapsed() >= budgetMs;
  }
}
