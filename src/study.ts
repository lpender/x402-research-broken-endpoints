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
import { createMockX402Client } from "./x402-client.js";
import { createMockZauthClient } from "./zauth-client.js";
import {
  mean,
  standardDeviation,
  confidenceInterval,
  tTest,
  cohensD,
} from "./statistics.js";

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

export async function runScientificStudy(
  config: StudyConfig,
  baseConfig: Config
): Promise<StudyResults> {
  console.log("\n=== Starting Scientific Study ===");
  console.log(`Trials per condition: ${config.trialsPerCondition}`);
  console.log(`Cycles per trial: ${config.cyclesPerTrial}`);
  console.log(`Base seed: ${config.baseSeed}`);
  console.log(`Mock mode: ${config.mockMode}`);
  console.log("");

  const noZauthTrials: TrialResults[] = [];
  const withZauthTrials: TrialResults[] = [];

  // Run matched pairs of trials
  for (let trialIdx = 0; trialIdx < config.trialsPerCondition; trialIdx++) {
    const trialSeed = config.baseSeed + trialIdx;
    console.log(`\nTrial ${trialIdx + 1}/${config.trialsPerCondition}`);

    // Run no-zauth condition
    console.log(`  Running no-zauth (seed: ${trialSeed})...`);
    const noZauthResult = await runTrial(
      "no-zauth",
      config.cyclesPerTrial,
      trialSeed,
      baseConfig,
      config.mockMode
    );
    noZauthTrials.push(noZauthResult);
    console.log(
      `    Burn rate: ${(noZauthResult.burnRate * 100).toFixed(2)}%`
    );

    // Run with-zauth condition with same seed
    console.log(`  Running with-zauth (seed: ${trialSeed})...`);
    const withZauthResult = await runTrial(
      "with-zauth",
      config.cyclesPerTrial,
      trialSeed,
      baseConfig,
      config.mockMode
    );
    withZauthTrials.push(withZauthResult);
    console.log(
      `    Burn rate: ${(withZauthResult.burnRate * 100).toFixed(2)}%`
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
  mockMode: boolean
): Promise<TrialResults> {
  const rng = new SeededRandom(seed);
  const metrics: CycleMetrics[] = [];

  // Create clients
  const x402Client = createMockX402Client(config, rng, mockMode);
  const zauthClient = mode === "with-zauth" ? createMockZauthClient(config, rng) : undefined;

  const agent = new YieldOptimizerAgent(mode, config, x402Client, zauthClient);

  // Run optimization cycles
  for (let cycleIdx = 0; cycleIdx < cycles; cycleIdx++) {
    const startTime = Date.now();
    const result: OptimizationResult = await agent.runOptimizationCycle();
    const latencyMs = Date.now() - startTime;

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

  return {
    trials,
    avgBurnRate: mean(burnRates),
    avgTotalSpent: mean(totalSpents),
    avgTotalBurn: mean(totalBurns),
    stdDevBurnRate: standardDeviation(burnRates),
  };
}
