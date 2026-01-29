// Shared TypeScript interfaces for the scientific study

export interface PoolData {
  poolId: string;
  tokenA: string;
  tokenB: string;
  tvl: number;
  apy: number;
  volume24h: number;
  feeRate: number;
  impermanentLossRisk: "low" | "medium" | "high";
}

export interface WhaleMove {
  wallet: string;
  action: "buy" | "sell" | "transfer";
  token: string;
  amount: number;
  timestamp: Date;
  significance: number; // 0-1 market impact score
}

export interface SentimentScore {
  token: string;
  score: number; // -1 to 1
  confidence: number; // 0 to 1
  sources: string[];
}

export interface Allocation {
  poolId: string;
  percentage: number;
  reasoning: string;
}

export interface AggregatedData {
  poolData: PoolData[];
  whaleData: WhaleMove[];
  sentimentData: SentimentScore[];
  dataQuality: number; // 0-1, penalizes missing data
}

export interface OptimizationResult {
  poolData: PoolData[];
  whaleData: WhaleMove[];
  sentimentData: SentimentScore[];
  allocation: Allocation;
  totalSpent: number;
  totalBurn: number;
  zauthCost: number;
  queriesAttempted: number;
  queriesFailed: number;
}

export interface CycleMetrics {
  spentUsdc: number;
  burnUsdc: number;
  zauthCostUsdc: number;
  queriesAttempted: number;
  queriesFailed: number;
  latencyMs: number;
}

export interface TrialResults {
  metrics: CycleMetrics[];
  totalSpent: number;
  totalBurn: number;
  burnRate: number;
  avgLatency: number;
}

export interface ConditionResults {
  trials: TrialResults[];
  avgBurnRate: number;
  avgTotalSpent: number;
  avgTotalBurn: number;
  stdDevBurnRate: number;
}

export interface StudyResults {
  noZauth: ConditionResults;
  withZauth: ConditionResults;
  burnReductionPercent: number;
  confidenceInterval95: [number, number];
  pValue: number;
  effectSize: number;
  netSavingsPerCycle: number;
  breakEvenFailureRate: number;
}

export interface StudyConfig {
  trialsPerCondition: number;
  cyclesPerTrial: number;
  baseSeed: number;
  conditions: ["no-zauth", "with-zauth"];
  outputDir: string;
  mockMode: boolean;
}
