import type {
  StudyConfig,
  StudyResults,
  ConditionResults,
  TrialResults,
  CycleMetrics,
  OptimizationResult,
} from "./types.js";
import type { Config } from "./config.js";
import { YieldOptimizerAgent } from "./yield-agent.js";
import { createMockX402Client, createRealX402Client, type X402Client } from "./x402-client.js";
import { createMockZauthClient } from "./zauth-client.js";
import {
  mean,
  standardDeviation,
  confidenceInterval,
  tTest,
  cohensD,
} from "./statistics.js";
import { createSpendTracker, type SpendTracker } from "./spend-tracker.js";

interface ProgressTracker {
  totalTrials: number;
  totalCycles: number;
  completedTrials: number;
  completedCycles: number;
  startTime: number;
  lastUpdateTime: number;
}

function createProgressTracker(
  totalTrials: number,
  totalCycles: number
): ProgressTracker {
  return {
    totalTrials,
    totalCycles,
    completedTrials: 0,
    completedCycles: 0,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
  };
}

function updateProgress(tracker: ProgressTracker): void {
  const now = Date.now();
  const elapsed = (now - tracker.startTime) / 1000; // seconds

  // Calculate total progress (trials * 2 for both conditions)
  const totalWork = tracker.totalTrials * 2;
  const completedWork = tracker.completedTrials;
  const progressPercent = (completedWork / totalWork) * 100;

  // Estimate time remaining
  const workRate = completedWork / elapsed; // work units per second
  const remainingWork = totalWork - completedWork;
  const estimatedSecondsRemaining = remainingWork / workRate;

  // Format time remaining
  let timeRemaining = "calculating...";
  if (isFinite(estimatedSecondsRemaining) && estimatedSecondsRemaining > 0) {
    const minutes = Math.floor(estimatedSecondsRemaining / 60);
    const seconds = Math.floor(estimatedSecondsRemaining % 60);
    timeRemaining = `${minutes}m ${seconds}s`;
  }

  // Clear line and write progress
  process.stdout.write("\r");
  process.stdout.write(
    `Progress: ${progressPercent.toFixed(1)}% | Trial ${Math.floor(completedWork / 2) + 1}/${tracker.totalTrials} | ETA: ${timeRemaining}` +
      " ".repeat(10)
  );

  tracker.lastUpdateTime = now;
}

type AgentMode = "no-zauth" | "with-zauth";

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Linear congruential generator
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return this.seed / 2 ** 32;
  }
}

let partialResults: { noZauth: TrialResults[]; withZauth: TrialResults[] } | null =
  null;
let isInterrupted = false;
let isBudgetExhausted = false;

export async function runScientificStudy(
  config: StudyConfig,
  baseConfig: Config
): Promise<StudyResults> {
  // Reset state for new study
  isBudgetExhausted = false;

  console.log("\n=== Starting Scientific Study ===");
  console.log(`Trials per condition: ${config.trialsPerCondition}`);
  console.log(`Cycles per trial: ${config.cyclesPerTrial}`);
  console.log(`Base seed: ${config.baseSeed}`);
  console.log(`Mock mode: ${config.mockMode}`);
  if (config.budgetUsdc !== undefined) {
    console.log(`Budget: $${config.budgetUsdc.toFixed(2)} USDC`);
  }
  console.log("");

  const noZauthTrials: TrialResults[] = [];
  const withZauthTrials: TrialResults[] = [];

  // Create spend tracker if budget is set
  const spendTracker = config.budgetUsdc !== undefined
    ? createSpendTracker(config.budgetUsdc)
    : null;

  // Create x402 client once (real client initialized once, reused across trials)
  let x402Client: X402Client | null = null;
  if (!config.mockMode) {
    console.log("Initializing real x402 client...");
    x402Client = await createRealX402Client(baseConfig);
    console.log("Real x402 client ready.\n");
  }

  // Set up Ctrl+C handler
  const handleInterrupt = () => {
    if (isInterrupted) {
      console.log("\n\nForce quit - no results saved.");
      process.exit(1);
    }
    isInterrupted = true;
    partialResults = { noZauth: noZauthTrials, withZauth: withZauthTrials };
    console.log(
      "\n\nInterrupted! Saving partial results... (press Ctrl+C again to force quit)"
    );
  };

  process.on("SIGINT", handleInterrupt);

  try {
    const progress = createProgressTracker(
      config.trialsPerCondition,
      config.cyclesPerTrial
    );

    // Run matched pairs of trials
    for (let trialIdx = 0; trialIdx < config.trialsPerCondition; trialIdx++) {
      if (isInterrupted || isBudgetExhausted) break;

      const trialSeed = config.baseSeed + trialIdx;

      // Run no-zauth condition
      updateProgress(progress);
      const noZauthResult = await runTrial(
        "no-zauth",
        config.cyclesPerTrial,
        trialSeed,
        baseConfig,
        config.mockMode,
        x402Client,
        spendTracker
      );
      noZauthTrials.push(noZauthResult);
      progress.completedTrials++;

      if (isInterrupted || isBudgetExhausted) break;

      // Run with-zauth condition with same seed
      updateProgress(progress);
      const withZauthResult = await runTrial(
        "with-zauth",
        config.cyclesPerTrial,
        trialSeed,
        baseConfig,
        config.mockMode,
        x402Client,
        spendTracker
      );
      withZauthTrials.push(withZauthResult);
      progress.completedTrials++;
    }

    // Clear progress line
    process.stdout.write("\r" + " ".repeat(80) + "\r");

    if (isBudgetExhausted && spendTracker) {
      // Ensure we have paired trials (remove unpaired trial if exists)
      const minTrials = Math.min(noZauthTrials.length, withZauthTrials.length);
      noZauthTrials.length = minTrials;
      withZauthTrials.length = minTrials;

      console.log(
        `\nBudget exhausted: ${spendTracker.getSummary()}`
      );
      console.log(
        `Partial study saved: ${minTrials}/${config.trialsPerCondition} trial pairs completed`
      );
    } else if (isInterrupted) {
      // Ensure we have paired trials (remove unpaired trial if exists)
      const minTrials = Math.min(noZauthTrials.length, withZauthTrials.length);
      noZauthTrials.length = minTrials;
      withZauthTrials.length = minTrials;

      console.log(
        `\nPartial study completed: ${minTrials}/${config.trialsPerCondition} trials`
      );
    } else {
      console.log("\nStudy completed successfully!");
      if (spendTracker) {
        console.log(`Final spend: ${spendTracker.getSummary()}`);
      }
    }
  } finally {
    // Clean up interrupt handler
    process.off("SIGINT", handleInterrupt);
  }

  // Ensure we have at least 1 trial to analyze
  if (noZauthTrials.length === 0 || withZauthTrials.length === 0) {
    throw new Error(
      "Study interrupted too early - no complete trial pairs to analyze"
    );
  }

  // Aggregate condition results
  const noZauth = aggregateConditionResults(noZauthTrials);
  const withZauth = aggregateConditionResults(withZauthTrials);

  // Statistical analysis
  const noZauthBurnRates = noZauthTrials.map((t) => t.burnRate);
  const withZauthBurnRates = withZauthTrials.map((t) => t.burnRate);

  const burnReductionPercent =
    ((noZauth.avgBurnRate - withZauth.avgBurnRate) / noZauth.avgBurnRate) * 100;

  // Calculate confidence interval for burn reduction
  const burnReductions = noZauthBurnRates.map(
    (noZ, i) => ((noZ - withZauthBurnRates[i]) / noZ) * 100
  );
  const confidenceInterval95 = confidenceInterval(burnReductions, 0.95);

  // Hypothesis testing
  const { pValue } = tTest(noZauthBurnRates, withZauthBurnRates);
  const effectSize = cohensD(noZauthBurnRates, withZauthBurnRates);

  // Cost-benefit analysis
  const avgNoZauthBurnPerCycle = noZauth.avgTotalBurn / config.cyclesPerTrial;
  const avgWithZauthBurnPerCycle =
    withZauth.avgTotalBurn / config.cyclesPerTrial;
  const netSavingsPerCycle = avgNoZauthBurnPerCycle - avgWithZauthBurnPerCycle;

  // Break-even failure rate calculation
  // Zauth cost is fixed at 0.001 USDC per check
  // Break-even when: zauthCost = burnSavings
  const avgZauthCostPerCycle = 0.001 * 10; // ~10 checks per cycle
  const avgQueryCost = 0.01; // USDC per query
  const breakEvenFailureRate = avgZauthCostPerCycle / avgQueryCost;

  return {
    noZauth,
    withZauth,
    burnReductionPercent,
    confidenceInterval95,
    pValue,
    effectSize,
    netSavingsPerCycle,
    breakEvenFailureRate,
  };
}

async function runTrial(
  mode: AgentMode,
  cycles: number,
  seed: number,
  config: Config,
  mockMode: boolean,
  sharedX402Client: X402Client | null = null,
  spendTracker: SpendTracker | null = null
): Promise<TrialResults> {
  const rng = new SeededRandom(seed);
  const metrics: CycleMetrics[] = [];

  // Use shared real client if provided, otherwise create mock client
  const x402Client = sharedX402Client ?? createMockX402Client(config, rng, mockMode);
  const zauthClient = mode === "with-zauth" ? createMockZauthClient(config, rng) : undefined;

  const agent = new YieldOptimizerAgent(mode, config, x402Client, zauthClient);

  // Estimate cost per cycle (rough estimate for budget check)
  const estimatedCostPerCycle = 0.03; // ~$0.03 per cycle (3 queries @ ~$0.01)

  // Run optimization cycles
  for (let cycleIdx = 0; cycleIdx < cycles; cycleIdx++) {
    // Check budget before each cycle
    if (spendTracker && !spendTracker.canSpend(estimatedCostPerCycle)) {
      isBudgetExhausted = true;
      break;
    }

    const startTime = Date.now();
    const result: OptimizationResult = await agent.runOptimizationCycle();
    const latencyMs = Date.now() - startTime;

    // Record actual spend
    if (spendTracker) {
      spendTracker.recordSpend(result.totalSpent);
    }

    metrics.push({
      spentUsdc: result.totalSpent,
      burnUsdc: result.totalBurn,
      zauthCostUsdc: result.zauthCost,
      queriesAttempted: result.queriesAttempted,
      queriesFailed: result.queriesFailed,
      latencyMs,
    });
  }

  // Aggregate trial results
  const totalSpent = metrics.reduce((sum, m) => sum + m.spentUsdc, 0);
  const totalBurn = metrics.reduce((sum, m) => sum + m.burnUsdc, 0);
  const burnRate = totalSpent > 0 ? totalBurn / totalSpent : 0;
  const avgLatency = mean(metrics.map((m) => m.latencyMs));

  return {
    metrics,
    totalSpent,
    totalBurn,
    burnRate,
    avgLatency,
  };
}

function aggregateConditionResults(trials: TrialResults[]): ConditionResults {
  const burnRates = trials.map((t) => t.burnRate);
  const totalSpents = trials.map((t) => t.totalSpent);
  const totalBurns = trials.map((t) => t.totalBurn);

  // Calculate average queries across all trials
  const queriesAttemptedPerTrial = trials.map((t) =>
    t.metrics.reduce((sum, m) => sum + m.queriesAttempted, 0)
  );
  const queriesFailedPerTrial = trials.map((t) =>
    t.metrics.reduce((sum, m) => sum + m.queriesFailed, 0)
  );

  return {
    trials,
    avgBurnRate: mean(burnRates),
    avgTotalSpent: mean(totalSpents),
    avgTotalBurn: mean(totalBurns),
    stdDevBurnRate: standardDeviation(burnRates),
    avgQueriesAttempted: mean(queriesAttemptedPerTrial),
    avgQueriesFailed: mean(queriesFailedPerTrial),
  };
}
