import type {
  EnrichedPrepaymentTestResult,
  Stage2Result,
  QueryResult,
  EndpointComparison,
  ModeResults,
  ComparisonSummary,
  AllocationComparison
} from "./types.js";
import type { Config, Network } from "./config.js";
import { YieldOptimizerAgent } from "./yield-agent.js";
import { createSpendTracker, type SpendTracker } from "./spend-tracker.js";
import { extractPoolData, extractWhaleData, extractSentimentData } from "./stage2-mapper.js";

/**
 * Stage 2: Real Yield Optimization Runner
 *
 * Executes interleaved comparison of no-zauth vs with-zauth modes
 * on the same set of endpoints from Stage 1
 */

export async function runStage2(
  endpoints: EnrichedPrepaymentTestResult[],
  budget: number,
  network: Network,
  config: Config,
  x402Client: any,
  zauthClient: any
): Promise<Stage2Result> {
  const startTime = Date.now();

  // Filter to 402-enabled endpoints only
  const paymentEndpoints = endpoints.filter(e => e.requires402);

  console.log(`\n[Stage 2] Filtered to ${paymentEndpoints.length} endpoints requiring payment`);

  // Distribute budget across categories (33%/33%/34%)
  const categoryBudgets = {
    pool: budget * 0.33,
    whale: budget * 0.33,
    sentiment: budget * 0.34
  };

  console.log(`\n[Stage 2] Budget distribution:`);
  console.log(`  Pool: $${categoryBudgets.pool.toFixed(3)}`);
  console.log(`  Whale: $${categoryBudgets.whale.toFixed(3)}`);
  console.log(`  Sentiment: $${categoryBudgets.sentiment.toFixed(3)}`);

  // Run interleaved comparison for each category
  const poolComparisons = await runCategoryComparison(
    paymentEndpoints.filter(e => e.category === 'pool'),
    categoryBudgets.pool,
    'pool',
    network,
    config,
    x402Client,
    zauthClient
  );

  const whaleComparisons = await runCategoryComparison(
    paymentEndpoints.filter(e => e.category === 'whale'),
    categoryBudgets.whale,
    'whale',
    network,
    config,
    x402Client,
    zauthClient
  );

  const sentimentComparisons = await runCategoryComparison(
    paymentEndpoints.filter(e => e.category === 'sentiment'),
    categoryBudgets.sentiment,
    'sentiment',
    network,
    config,
    x402Client,
    zauthClient
  );

  const allComparisons = [...poolComparisons, ...whaleComparisons, ...sentimentComparisons];

  // Extract data for each mode
  const noZauthResults = extractModeResults(allComparisons, 'noZauth');
  const withZauthResults = extractModeResults(allComparisons, 'withZauth');

  // Generate comparison summary
  const comparisonSummary = generateComparisonSummary(allComparisons, budget);

  // Generate allocation comparison
  const allocationComparison = generateAllocationComparison(
    noZauthResults,
    withZauthResults
  );

  const durationSeconds = (Date.now() - startTime) / 1000;

  return {
    noZauthResults,
    withZauthResults,
    endpointComparisons: allComparisons,
    comparisonSummary,
    allocationComparison,
    durationSeconds
  };
}

/**
 * Runs interleaved comparison for a single category
 */
async function runCategoryComparison(
  endpoints: EnrichedPrepaymentTestResult[],
  categoryBudget: number,
  category: string,
  network: Network,
  config: Config,
  x402Client: any,
  zauthClient: any
): Promise<EndpointComparison[]> {
  if (endpoints.length === 0) {
    console.log(`\n[${category}] No endpoints available`);
    return [];
  }

  // Sort by price (ascending) to maximize comparisons
  const sortedEndpoints = endpoints.sort((a, b) => {
    const priceA = a.requested402Price || a.price || 0.01;
    const priceB = b.requested402Price || b.price || 0.01;
    return priceA - priceB;
  });

  console.log(`\n[${category}] Processing ${sortedEndpoints.length} endpoints (sorted by price)`);
  console.log(`[${category}] Budget: $${categoryBudget.toFixed(3)}`);

  const comparisons: EndpointComparison[] = [];
  const spendTracker = createSpendTracker(categoryBudget);

  // Create agents for both modes
  const noZauthAgent = new YieldOptimizerAgent(
    'no-zauth',
    config,
    x402Client,
    undefined,
    'real',
    network
  );

  const withZauthAgent = new YieldOptimizerAgent(
    'with-zauth',
    config,
    x402Client,
    zauthClient,
    'real',
    network
  );

  // Interleaved comparison loop
  for (const endpoint of sortedEndpoints) {
    const estimatedCost = (endpoint.requested402Price || endpoint.price || 0.01) * 2;

    // Pre-flight budget check (need room for BOTH queries)
    if (!spendTracker.canSpend(estimatedCost)) {
      console.log(`[${category}] Budget exhausted after ${comparisons.length} comparisons`);
      break;
    }

    // Query with no-zauth
    const noZauthResult = await noZauthAgent.queryWithValidation(endpoint);
    spendTracker.recordSpend(noZauthResult.spent);

    // Query with with-zauth
    const withZauthResult = await withZauthAgent.queryWithValidation(endpoint);
    spendTracker.recordSpend(withZauthResult.spent + (withZauthResult.zauthCost || 0));

    // Calculate savings
    const burnSavings = noZauthResult.burn - withZauthResult.burn;
    const netSavings = burnSavings - (withZauthResult.zauthCost || 0);

    comparisons.push({
      endpoint,
      noZauth: noZauthResult,
      withZauth: withZauthResult,
      burnSavings,
      netSavings
    });

    if (config.verbose) {
      console.log(`[${category}] ${endpoint.name}:`);
      console.log(`  No-zauth: ${noZauthResult.success ? '✓' : '✗'} ($${noZauthResult.spent.toFixed(3)}, burn: $${noZauthResult.burn.toFixed(3)})`);
      console.log(`  With-zauth: ${withZauthResult.success ? '✓' : '✗'} ($${withZauthResult.spent.toFixed(3)}, burn: $${withZauthResult.burn.toFixed(3)}, zauth: $${(withZauthResult.zauthCost || 0).toFixed(3)})`);
      console.log(`  Savings: $${netSavings.toFixed(3)}`);
    }
  }

  console.log(`[${category}] Completed ${comparisons.length} comparisons, spent: $${spendTracker.getSpentAmount().toFixed(3)}`);

  return comparisons;
}

/**
 * Extracts mode-specific results from comparisons
 */
function extractModeResults(
  comparisons: EndpointComparison[],
  mode: 'noZauth' | 'withZauth'
): ModeResults {
  const queryResults = comparisons.map(c => c[mode]);

  // Extract data by category
  const poolResults = queryResults.filter(r => r.endpoint.category === 'pool');
  const whaleResults = queryResults.filter(r => r.endpoint.category === 'whale');
  const sentimentResults = queryResults.filter(r => r.endpoint.category === 'sentiment');

  const poolData = extractDataFromResults(poolResults, 'pool');
  const whaleData = extractDataFromResults(whaleResults, 'whale');
  const sentimentData = extractDataFromResults(sentimentResults, 'sentiment');

  // Calculate metrics
  const totalSpent = queryResults.reduce((sum, r) => sum + r.spent, 0);
  const totalBurn = queryResults.reduce((sum, r) => sum + r.burn, 0);
  const zauthCost = queryResults.reduce((sum, r) => sum + (r.zauthCost || 0), 0);
  const queriesAttempted = queryResults.length;
  const queriesFailed = queryResults.filter(r => !r.success).length;
  const burnRate = totalSpent > 0 ? totalBurn / totalSpent : 0;

  // Calculate allocation (simplified for now - just pick best pool by APY)
  const allocation = calculateAllocation(poolData, whaleData, sentimentData);

  return {
    allocation,
    totalSpent,
    totalBurn,
    burnRate,
    zauthCost,
    queriesAttempted,
    queriesFailed,
    poolData,
    whaleData,
    sentimentData
  };
}

/**
 * Extracts typed data from query results
 */
function extractDataFromResults(results: QueryResult[], category: string): any[] {
  const allData: any[] = [];

  for (const result of results) {
    if (!result.success || !result.validationResult.valid) {
      continue;
    }

    try {
      const data = result.validationResult.data;

      if (category === 'pool') {
        const extracted = extractPoolData(data);
        allData.push(...extracted);
      } else if (category === 'whale') {
        const extracted = extractWhaleData(data);
        allData.push(...extracted);
      } else if (category === 'sentiment') {
        const extracted = extractSentimentData(data);
        allData.push(...extracted);
      }
    } catch (error) {
      // Skip extraction errors
      continue;
    }
  }

  return allData;
}

/**
 * Calculates optimal allocation (simplified version)
 */
function calculateAllocation(poolData: any[], whaleData: any[], sentimentData: any[]): any {
  // Calculate data quality
  const dataQuality = calculateDataQuality(poolData, whaleData, sentimentData);

  // If no pool data, return default allocation
  if (poolData.length === 0) {
    return {
      poolId: 'N/A',
      percentage: 0,
      reasoning: 'No pool data available',
      confidence: 0,
      dataQuality
    };
  }

  // Simple allocation: pick pool with highest APY
  const bestPool = poolData.reduce((best, pool) => {
    return pool.apy > best.apy ? pool : best;
  }, poolData[0]);

  return {
    poolId: bestPool.poolId,
    percentage: 100,
    reasoning: `Selected pool ${bestPool.poolId} with highest APY (${(bestPool.apy * 100).toFixed(2)}%)`,
    confidence: dataQuality,
    dataQuality
  };
}

/**
 * Calculates data quality score (0-1)
 */
function calculateDataQuality(poolData: any[], whaleData: any[], sentimentData: any[]): number {
  const poolScore = poolData.length > 0 ? Math.min(1, poolData.length / 5) : 0;
  const whaleScore = whaleData.length > 0 ? Math.min(1, whaleData.length / 10) : 0;
  const sentimentScore = sentimentData.length > 0 ? Math.min(1, sentimentData.length / 5) : 0;

  return (poolScore + whaleScore + sentimentScore) / 3;
}

/**
 * Generates comparison summary
 */
function generateComparisonSummary(
  comparisons: EndpointComparison[],
  budget: number
): ComparisonSummary {
  const noZauthTotalSpent = comparisons.reduce((sum, c) => sum + c.noZauth.spent, 0);
  const noZauthTotalBurn = comparisons.reduce((sum, c) => sum + c.noZauth.burn, 0);
  const withZauthTotalSpent = comparisons.reduce((sum, c) => sum + c.withZauth.spent, 0);
  const withZauthTotalBurn = comparisons.reduce((sum, c) => sum + c.withZauth.burn, 0);
  const withZauthZauthCost = comparisons.reduce((sum, c) => sum + (c.withZauth.zauthCost || 0), 0);

  const totalBurnSavings = comparisons.reduce((sum, c) => sum + c.burnSavings, 0);
  const totalNetSavings = comparisons.reduce((sum, c) => sum + c.netSavings, 0);
  const budgetUsed = noZauthTotalSpent + withZauthTotalSpent + withZauthZauthCost;

  const burnReduction = noZauthTotalBurn > 0
    ? ((noZauthTotalBurn - withZauthTotalBurn) / noZauthTotalBurn) * 100
    : 0;

  return {
    endpointsCompared: comparisons.length,
    budgetUsed,
    noZauth: {
      totalSpent: noZauthTotalSpent,
      totalBurn: noZauthTotalBurn,
      burnRate: noZauthTotalSpent > 0 ? noZauthTotalBurn / noZauthTotalSpent : 0
    },
    withZauth: {
      totalSpent: withZauthTotalSpent,
      totalBurn: withZauthTotalBurn,
      burnRate: withZauthTotalSpent > 0 ? withZauthTotalBurn / withZauthTotalSpent : 0,
      zauthCost: withZauthZauthCost
    },
    totalBurnSavings,
    totalNetSavings,
    burnReduction
  };
}

/**
 * Generates allocation comparison
 */
function generateAllocationComparison(
  noZauthResults: ModeResults,
  withZauthResults: ModeResults
): AllocationComparison {
  const sameDecision = noZauthResults.allocation.poolId === withZauthResults.allocation.poolId;
  const noZauthConfidence = noZauthResults.allocation.confidence || 0;
  const withZauthConfidence = withZauthResults.allocation.confidence || 0;
  const confidenceDelta = withZauthConfidence - noZauthConfidence;

  return {
    noZauth: {
      poolId: noZauthResults.allocation.poolId,
      reasoning: noZauthResults.allocation.reasoning,
      confidence: noZauthConfidence,
      dataQuality: noZauthResults.allocation.dataQuality || 0
    },
    withZauth: {
      poolId: withZauthResults.allocation.poolId,
      reasoning: withZauthResults.allocation.reasoning,
      confidence: withZauthConfidence,
      dataQuality: withZauthResults.allocation.dataQuality || 0
    },
    sameDecision,
    confidenceDelta
  };
}
