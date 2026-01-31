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
  confidence?: number;  // 0-1 confidence score
  dataQuality?: number; // 0-1 data quality score
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
  avgQueriesAttempted: number;
  avgQueriesFailed: number;
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
  budgetUsdc?: number; // Optional budget limit for real mode
  network?: "base" | "solana"; // Network for real mode (default: base)
  bazaarClient?: any; // BazaarDiscoveryClient instance (optional)
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;        // Atomic units
  amountUsdc: number;    // Converted to human-readable USDC
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, any>;
}

export interface PaymentRequiredHeader {
  x402Version: number;
  error: string;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: PaymentRequirement[];
  extensions?: any;
}

export interface PrepaymentTestResult {
  url: string;
  requires402: boolean;
  status: number;
  headers: Record<string, string>;
  error?: string;
  // 402 response parsing fields:
  paymentRequired?: PaymentRequiredHeader;  // Full parsed payment-required header
  requested402Price?: number | null;        // Actual price from 402 response (null = no USDC found, undefined = not parsed)
  paymentOptions?: {
    count: number;
    networks: string[];
    minPriceUsdc: number;
    maxPriceUsdc: number;
  };
  parseError?: string;  // Error message if header parsing failed
}

export interface EnrichedPrepaymentTestResult extends PrepaymentTestResult {
  name: string;
  category: string;
  price: number;
  metadata?: any;
}

export interface DiscoveryStageResult {
  total: number;
  requires402: number;
  openAccess: number;
  failures: number;
  percentage402: number;
  details: EnrichedPrepaymentTestResult[];
}

// Stage 2 Types
export interface SchemaValidationResult {
  valid: boolean;
  data: any[];
  error?: string;
  schemaUsed: 'bazaar' | 'pattern' | 'none';
}

export interface QueryResult {
  endpoint: EnrichedPrepaymentTestResult;
  success: boolean;
  response: any;
  validationResult: SchemaValidationResult;
  spent: number;
  burn: number;
  latency: number;
  zauthCost?: number;  // Only for with-zauth mode
  skippedByZauth?: boolean;  // Only for with-zauth mode
  error?: string;
}

export interface EndpointComparison {
  endpoint: EnrichedPrepaymentTestResult;
  noZauth: QueryResult;
  withZauth: QueryResult;
  burnSavings: number;  // noZauth.burn - withZauth.burn
  netSavings: number;   // burnSavings - withZauth.zauthCost
}

export interface ModeResults {
  allocation: Allocation;
  totalSpent: number;
  totalBurn: number;
  burnRate: number;
  zauthCost: number;  // 0 for no-zauth mode
  queriesAttempted: number;
  queriesFailed: number;
  poolData: PoolData[];
  whaleData: WhaleMove[];
  sentimentData: SentimentScore[];
}

export interface ComparisonSummary {
  endpointsCompared: number;
  budgetUsed: number;
  noZauth: {
    totalSpent: number;
    totalBurn: number;
    burnRate: number;
  };
  withZauth: {
    totalSpent: number;
    totalBurn: number;
    burnRate: number;
    zauthCost: number;
  };
  totalBurnSavings: number;  // Sum of all burnSavings
  totalNetSavings: number;   // totalBurnSavings - total zauthCost
  burnReduction: number;     // Percentage reduction in burn
}

export interface AllocationComparison {
  noZauth: {
    poolId: string;
    reasoning: string;
    confidence: number;
    dataQuality: number;
  };
  withZauth: {
    poolId: string;
    reasoning: string;
    confidence: number;
    dataQuality: number;
  };
  sameDecision: boolean;  // Did both modes choose same pool?
  confidenceDelta: number;  // Difference in confidence levels
}

export interface Stage2Result {
  noZauthResults: ModeResults;
  withZauthResults: ModeResults;
  endpointComparisons: EndpointComparison[];
  comparisonSummary: ComparisonSummary;
  allocationComparison: AllocationComparison;
  durationSeconds: number;
}
