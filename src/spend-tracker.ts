/**
 * SpendTracker - Budget tracking and enforcement for real x402 payments
 *
 * Tracks cumulative spend against a budget limit and provides methods
 * to check if spending is allowed and how much budget remains.
 */

export interface SpendTrackerConfig {
  budgetUsdc: number;
}

export class SpendTracker {
  private readonly budgetUsdc: number;
  private spentUsdc: number;

  constructor(config: SpendTrackerConfig) {
    if (config.budgetUsdc <= 0) {
      throw new Error("Budget must be greater than 0");
    }
    this.budgetUsdc = config.budgetUsdc;
    this.spentUsdc = 0;
  }

  /**
   * Record a spend amount. Adds to cumulative total.
   * @param amount - Amount in USDC to record
   */
  recordSpend(amount: number): void {
    if (amount < 0) {
      throw new Error("Spend amount cannot be negative");
    }
    this.spentUsdc += amount;
  }

  /**
   * Check if spending a given amount would stay within budget.
   * @param amount - Amount in USDC to check
   * @returns true if spending would not exceed budget, false otherwise
   */
  canSpend(amount: number): boolean {
    return this.spentUsdc + amount <= this.budgetUsdc;
  }

  /**
   * Get the remaining budget available.
   * @returns Remaining budget in USDC
   */
  getRemainingBudget(): number {
    return this.budgetUsdc - this.spentUsdc;
  }

  /**
   * Get total amount spent so far.
   * @returns Total spent in USDC
   */
  getSpentAmount(): number {
    return this.spentUsdc;
  }

  /**
   * Get the total budget limit.
   * @returns Budget limit in USDC
   */
  getBudgetLimit(): number {
    return this.budgetUsdc;
  }

  /**
   * Check if budget is exhausted (remaining <= 0).
   * @returns true if no budget remains
   */
  isExhausted(): boolean {
    return this.getRemainingBudget() <= 0;
  }

  /**
   * Get a summary string of current spend status.
   * @returns Formatted string like "spent $1.50 of $5.00 ($3.50 remaining)"
   */
  getSummary(): string {
    return `spent $${this.spentUsdc.toFixed(2)} of $${this.budgetUsdc.toFixed(2)} ($${this.getRemainingBudget().toFixed(2)} remaining)`;
  }
}

/**
 * Factory function to create a SpendTracker instance.
 * @param budgetUsdc - Maximum budget in USDC
 * @returns SpendTracker instance
 */
export function createSpendTracker(budgetUsdc: number): SpendTracker {
  return new SpendTracker({ budgetUsdc });
}
