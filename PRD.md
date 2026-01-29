# PRD: Zauth x402 Burn Reduction Scientific Study

---

## Executive Summary

Build an agent that performs a realistic DeFi yield optimization workflow, measuring "burn" (money wasted on failed/invalid API responses) with and without Zauth x402 endpoint verification. The study will provide neutral, reproducible scientific evidence of cost savings.

---

## Problem Statement

When AI agents or automated systems query DeFi data providers via x402 micropayments, they pay before knowing if the endpoint will return valid data. Unreliable endpoints cause "burn" - money spent on invalid responses. Zauth x402 provides pre-payment reliability verification, but we need empirical evidence of its value.

---

## Goals

1. **Simulate realistic DeFi yield optimization** - Not just random API calls, but a coherent agent workflow
2. **Neutral measurement methodology** - Same conditions, same endpoints, only Zauth on/off differs
3. **Statistically significant results** - Enough iterations for confidence intervals
4. **Reproducible experiments** - Deterministic random seeds, documented methodology
5. **Extrapolatable findings** - Results that can scale to market-wide projections

---

## Proposed Architecture

### Phase 1: DeFi Yield Optimization Agent

Create a realistic agent that performs these steps in a yield optimization loop:

```
1. Query pool data (Raydium, Orca, Kamino) → Find highest APY pools
2. Query whale activity → Detect large position changes
3. Query sentiment data → Check market sentiment for tokens
4. Calculate optimal allocation → Based on aggregated data
5. (Mock) Rebalance portfolio → Log recommended trades
```

Each step involves x402 micropayments. Invalid responses force retries or degrade decision quality.

### Phase 2: Burn Measurement Framework

**Control Group (no-zauth):**
- Agent queries endpoints directly via x402
- All payments made regardless of endpoint reliability
- Track: total spend, invalid responses, burn rate

**Treatment Group (with-zauth):**
- Agent checks Zauth reliability score before each query
- Skip endpoints below 70% reliability threshold
- Track: total spend, zauth check costs, invalid responses, burn rate

### Phase 3: Scientific Study Protocol

```
Experiment Design:
├── 10 trials per condition (no-zauth vs with-zauth)
├── 50 yield optimization cycles per trial
├── Randomized endpoint selection order
├── Fixed random seed per trial pair (matched conditions)
├── Controlled failure rates via mock endpoints
└── Statistical analysis with confidence intervals
```

---

## Implementation Tasks

### Task 1: Create Yield Optimization Agent (`src/yield-agent.ts`)

```typescript
interface YieldOptimizerAgent {
  // Core workflow
  async runOptimizationCycle(): Promise<OptimizationResult>;

  // Data gathering (each makes x402 payments)
  async fetchPoolData(): Promise<PoolData[]>;
  async fetchWhaleActivity(): Promise<WhaleMove[]>;
  async fetchSentimentData(): Promise<SentimentScore[]>;

  // Decision logic
  calculateOptimalAllocation(data: AggregatedData): Allocation;

  // Mode: 'no-zauth' | 'with-zauth'
  constructor(mode: string, x402Client, zauthClient?);
}
```

**Acceptance Criteria:**
- Agent performs coherent multi-step yield optimization
- Each data fetch uses x402 micropayment
- Agent handles partial data (some endpoints fail)
- Agent logs decisions and data quality

### Task 2: Enhance Mock Endpoints (`src/endpoints.ts`)

Add more realistic DeFi data responses:

```typescript
// Pool data with realistic APY calculations
interface PoolData {
  poolId: string;
  tokenA: string;
  tokenB: string;
  tvl: number;
  apy: number;         // 5-50% range
  volume24h: number;
  feeRate: number;
  impermanentLossRisk: 'low' | 'medium' | 'high';
}

// Whale tracking for market signals
interface WhaleMove {
  wallet: string;
  action: 'buy' | 'sell' | 'transfer';
  token: string;
  amount: number;
  timestamp: Date;
  significance: number;  // 0-1 market impact score
}

// Sentiment for decision weighting
interface SentimentScore {
  token: string;
  score: number;       // -1 to 1
  confidence: number;  // 0 to 1
  sources: string[];
}
```

**Acceptance Criteria:**
- Responses contain enough data for optimization decisions
- Failure modes are realistic (partial data, stale data, errors)
- Configurable failure rates per endpoint

### Task 3: Create Scientific Study Runner (`src/study.ts`)

```typescript
interface StudyConfig {
  trialsPerCondition: number;    // 10 recommended
  cyclesPerTrial: number;        // 50 recommended
  baseSeed: number;              // For reproducibility
  conditions: ['no-zauth', 'with-zauth'];
  outputDir: string;
}

interface StudyResults {
  // Per-condition aggregates
  noZauth: ConditionResults;
  withZauth: ConditionResults;

  // Statistical analysis
  burnReductionPercent: number;
  confidenceInterval95: [number, number];
  pValue: number;
  effectSize: number;  // Cohen's d

  // Cost-benefit
  netSavingsPerCycle: number;
  breakEvenFailureRate: number;
}

async function runScientificStudy(config: StudyConfig): Promise<StudyResults>;
```

**Acceptance Criteria:**
- Matched random seeds between conditions (fair comparison)
- Calculates confidence intervals (95% CI)
- Reports statistical significance (p-value)
- Exports raw data for external validation

### Task 4: Statistical Analysis Module (`src/statistics.ts`)

```typescript
// Basic statistical functions
function mean(values: number[]): number;
function standardDeviation(values: number[]): number;
function confidenceInterval(values: number[], confidence: number): [number, number];

// Hypothesis testing
function tTest(group1: number[], group2: number[]): { tStatistic: number; pValue: number };
function cohensD(group1: number[], group2: number[]): number;

// Effect size interpretation
function interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large';
```

**Acceptance Criteria:**
- Correct implementation of t-test for paired samples
- Effect size calculation (Cohen's d)
- Clear interpretation of results

### Task 5: Results Visualization & Export (`src/report.ts`)

```typescript
interface ReportGenerator {
  // Console output
  printSummaryTable(results: StudyResults): void;
  printStatisticalAnalysis(results: StudyResults): void;

  // File exports
  exportRawDataCsv(results: StudyResults, path: string): void;
  exportSummaryJson(results: StudyResults, path: string): void;
  generateMarkdownReport(results: StudyResults, path: string): void;
}
```

**Acceptance Criteria:**
- Human-readable summary tables
- Raw CSV data for external analysis
- Markdown report suitable for publication

### Task 6: CLI Interface Updates (`src/index.ts`)

Add new CLI commands:

```bash
# Run full scientific study (mock mode - default)
npx tsx src/index.ts --study --trials=10 --cycles=50

# Run scientific study with real x402 payments (for final validation)
npx tsx src/index.ts --study --trials=10 --cycles=50 --real

# Run single agent workflow (for debugging)
npx tsx src/index.ts --agent --mode=with-zauth --cycles=5

# Generate report from existing data
npx tsx src/index.ts --report --input=results/study_*.json
```

**Acceptance Criteria:**
- Clear CLI help text
- Progress indicators during long studies
- Graceful interruption handling (save partial results)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Statistical significance | p < 0.05 |
| Burn reduction | Measurable difference (>0%) |
| Study reproducibility | Same seed → same results |
| Report clarity | Non-technical reader can understand |

---

## Testing Plan

1. **Unit tests** for statistical functions
2. **Integration tests** for yield agent workflow
3. **End-to-end test** with small study (2 trials, 5 cycles)
4. **Reproducibility test** - run twice with same seed, compare

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/yield-agent.ts` | Create | DeFi yield optimization agent |
| `src/study.ts` | Create | Scientific study runner |
| `src/statistics.ts` | Create | Statistical analysis functions |
| `src/report.ts` | Create | Results visualization & export |
| `src/endpoints.ts` | Modify | Enhanced mock DeFi data |
| `src/index.ts` | Modify | New CLI commands |
| `src/types.ts` | Create | Shared TypeScript interfaces |

---

## Verification

After implementation, verify by:

1. Run `npx tsx src/index.ts --study --trials=3 --cycles=10` (quick test)
2. Check `results/` for generated CSV and JSON files
3. Review Markdown report for clarity
4. Confirm statistical calculations match manual verification
5. Re-run with same seed, confirm identical results

---

## Configuration Decisions

| Setting | Value | Rationale |
|---------|-------|-----------|
| Default trials | 10 | Statistically robust |
| Default cycles | 50 | ~500 data points per condition |
| Payment modes | Mock + Real | Mock for development, real for final validation |

---

## Setup: Create prd-items.json

Create `prd-items.json` with structured requirements:

```json
{
  "items": [
    {
      "id": "YIELD-001",
      "category": "yield-agent",
      "description": "Create YieldOptimizerAgent class that runs multi-step DeFi optimization cycle",
      "steps_to_verify": [
        "File src/yield-agent.ts exists",
        "Class exports YieldOptimizerAgent",
        "runOptimizationCycle() returns OptimizationResult with poolData, whaleData, sentimentData, allocation",
        "Constructor accepts mode ('no-zauth' | 'with-zauth') and clients"
      ],
      "passes": false
    },
    {
      "id": "YIELD-002",
      "category": "yield-agent",
      "description": "Agent fetches pool data from multiple DeFi endpoints via x402",
      "steps_to_verify": [
        "fetchPoolData() queries Raydium, Orca, Kamino endpoints",
        "Each query uses x402Client.queryEndpoint()",
        "Returns array of PoolData with poolId, tokenA, tokenB, tvl, apy, volume24h",
        "Handles partial failures gracefully (some endpoints fail, others succeed)"
      ],
      "passes": false
    },
    {
      "id": "YIELD-003",
      "category": "yield-agent",
      "description": "Agent fetches whale activity and sentiment data",
      "steps_to_verify": [
        "fetchWhaleActivity() returns WhaleMove[] with wallet, action, token, amount, significance",
        "fetchSentimentData() returns SentimentScore[] with token, score (-1 to 1), confidence",
        "Both methods use x402 micropayments"
      ],
      "passes": false
    },
    {
      "id": "YIELD-004",
      "category": "yield-agent",
      "description": "Agent calculates optimal allocation based on aggregated data",
      "steps_to_verify": [
        "calculateOptimalAllocation() takes pool, whale, sentiment data",
        "Returns Allocation with recommended pool, allocation percentage, reasoning",
        "Weights decisions by data quality (penalizes missing/failed data sources)"
      ],
      "passes": false
    },
    {
      "id": "YIELD-005",
      "category": "yield-agent",
      "description": "With-zauth mode checks reliability before each query",
      "steps_to_verify": [
        "In with-zauth mode, calls zauthClient.checkReliability() before x402 query",
        "Skips endpoints below 70% reliability threshold",
        "Tracks zauth check costs separately from x402 costs"
      ],
      "passes": false
    },
    {
      "id": "ENDPOINT-001",
      "category": "endpoints",
      "description": "Enhanced mock endpoints return realistic DeFi data",
      "steps_to_verify": [
        "Pool responses include: poolId, tokenA, tokenB, tvl (1M-100M), apy (5-50%), volume24h, feeRate, impermanentLossRisk",
        "Whale responses include: wallet (truncated address), action, token, amount, timestamp, significance (0-1)",
        "Sentiment responses include: token, score (-1 to 1), confidence (0-1), sources array"
      ],
      "passes": false
    },
    {
      "id": "ENDPOINT-002",
      "category": "endpoints",
      "description": "Mock endpoints have configurable failure modes",
      "steps_to_verify": [
        "Each endpoint has mockFailureRate (0-1)",
        "Failures return: empty data, error responses, or timeout simulation",
        "Failure rate can be set per-endpoint or globally"
      ],
      "passes": false
    },
    {
      "id": "STUDY-001",
      "category": "study",
      "description": "Scientific study runner executes matched trials",
      "steps_to_verify": [
        "runScientificStudy(config) runs N trials per condition",
        "Each trial pair (no-zauth, with-zauth) uses same random seed",
        "Default: 10 trials, 50 cycles each",
        "Supports --real flag for real x402 payments"
      ],
      "passes": false
    },
    {
      "id": "STUDY-002",
      "category": "study",
      "description": "Study collects per-iteration metrics",
      "steps_to_verify": [
        "Tracks per cycle: spentUsdc, burnUsdc, zauthCostUsdc, queriesAttempted, queriesFailed",
        "Aggregates per trial: totalSpent, totalBurn, burnRate, avgLatency",
        "Stores raw data for export"
      ],
      "passes": false
    },
    {
      "id": "STATS-001",
      "category": "statistics",
      "description": "Statistical analysis module calculates significance",
      "steps_to_verify": [
        "mean() and standardDeviation() work correctly",
        "confidenceInterval(values, 0.95) returns [lower, upper] bounds",
        "tTest(group1, group2) returns { tStatistic, pValue }",
        "cohensD(group1, group2) returns effect size"
      ],
      "passes": false
    },
    {
      "id": "STATS-002",
      "category": "statistics",
      "description": "Effect size interpretation helper",
      "steps_to_verify": [
        "interpretEffectSize(d) returns: negligible (d<0.2), small (0.2-0.5), medium (0.5-0.8), large (>0.8)",
        "Used in report generation for plain-English explanations"
      ],
      "passes": false
    },
    {
      "id": "REPORT-001",
      "category": "report",
      "description": "Console output shows summary tables",
      "steps_to_verify": [
        "printSummaryTable() shows: condition, trials, total spent, total burn, burn rate, net savings",
        "Uses cli-table3 for formatting",
        "Includes comparison row showing burn reduction percentage"
      ],
      "passes": false
    },
    {
      "id": "REPORT-002",
      "category": "report",
      "description": "Export functions generate CSV and JSON",
      "steps_to_verify": [
        "exportRawDataCsv() writes per-iteration data to results/study_TIMESTAMP.csv",
        "exportSummaryJson() writes StudyResults to results/study_TIMESTAMP.json",
        "Files include metadata: timestamp, config, git commit hash"
      ],
      "passes": false
    },
    {
      "id": "REPORT-003",
      "category": "report",
      "description": "Markdown report generation for publication",
      "steps_to_verify": [
        "generateMarkdownReport() creates results/study_TIMESTAMP.md",
        "Includes: executive summary, methodology, results table, statistical analysis, conclusions",
        "Statistical significance stated clearly (p-value, CI, effect size)"
      ],
      "passes": false
    },
    {
      "id": "CLI-001",
      "category": "cli",
      "description": "CLI supports --study command",
      "steps_to_verify": [
        "npx tsx src/index.ts --study runs scientific study",
        "--trials=N sets trials per condition (default 10)",
        "--cycles=N sets cycles per trial (default 50)",
        "--real flag enables real x402 payments"
      ],
      "passes": false
    },
    {
      "id": "CLI-002",
      "category": "cli",
      "description": "CLI supports --agent command for debugging",
      "steps_to_verify": [
        "npx tsx src/index.ts --agent --mode=with-zauth runs single agent",
        "--cycles=N sets optimization cycles",
        "Verbose output shows each step"
      ],
      "passes": false
    },
    {
      "id": "CLI-003",
      "category": "cli",
      "description": "CLI shows progress during long studies",
      "steps_to_verify": [
        "Progress bar or percentage shown during study execution",
        "Estimated time remaining displayed",
        "Ctrl+C saves partial results before exit"
      ],
      "passes": false
    },
    {
      "id": "E2E-001",
      "category": "e2e",
      "description": "End-to-end mock study produces valid results",
      "steps_to_verify": [
        "npx tsx src/index.ts --study --trials=2 --cycles=5 completes without error",
        "CSV file generated in results/",
        "JSON file generated in results/",
        "Markdown report generated in results/",
        "Statistical values are reasonable (not NaN, not Infinity)"
      ],
      "passes": false
    },
    {
      "id": "E2E-002",
      "category": "e2e",
      "description": "Reproducibility test passes",
      "steps_to_verify": [
        "Run study twice with --seed=12345",
        "Compare output JSON files",
        "Results are identical (deterministic)"
      ],
      "passes": false
    }
  ]
}
```

---

## Out of Scope

- Actual DeFi transactions (simulation only)
- UI/dashboard (CLI and file export only)
- Real-time monitoring (batch processing only)
