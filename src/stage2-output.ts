/**
 * Stage 2 Output Organization & Documentation
 *
 * Organizes Stage 2 comparison results into comprehensive folder structure with:
 * - README.md with methodology + comparison analysis
 * - comparison-summary.json with high-level metrics
 * - endpoint-comparisons.json with per-endpoint comparisons
 * - allocations.json with both allocation decisions
 * - no-zauth-results.json with detailed no-zauth mode results
 * - with-zauth-results.json with detailed with-zauth mode results
 */

import type { Stage2Result } from "./types.js";
import type { Config, Network } from "./config.js";
import * as fs from "fs/promises";
import * as path from "path";

export interface Stage2OutputPaths {
  folderPath: string;
  readmePath: string;
  comparisonSummaryPath: string;
  endpointComparisonsPath: string;
  allocationsPath: string;
  noZauthResultsPath: string;
  withZauthResultsPath: string;
}

/**
 * Create timestamped output folder for Stage 2 run
 * Format: YYYY-MM-DDTHH-MM-SS_stage2_{network}
 */
export function createStage2OutputFolder(
  network: string,
  timestamp: string
): Stage2OutputPaths {
  const date = new Date(timestamp);

  // EST/EDT handling
  const estDateString = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const [datePart, timePart] = estDateString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  const estTimestamp = `${year}-${month}-${day}T${hour}-${minute}-${second}`;
  const folderName = `${estTimestamp}_stage2_${network}`;
  const folderPath = path.join('results', folderName);

  return {
    folderPath,
    readmePath: path.join(folderPath, 'README.md'),
    comparisonSummaryPath: path.join(folderPath, 'comparison-summary.json'),
    endpointComparisonsPath: path.join(folderPath, 'endpoint-comparisons.json'),
    allocationsPath: path.join(folderPath, 'allocations.json'),
    noZauthResultsPath: path.join(folderPath, 'no-zauth-results.json'),
    withZauthResultsPath: path.join(folderPath, 'with-zauth-results.json')
  };
}

/**
 * Generate comprehensive README.md with methodology + comparison analysis
 */
export function generateStage2ReadMe(
  result: Stage2Result,
  network: Network,
  config: Config,
  timestamp: string,
  stage1Path: string
): string {
  const { comparisonSummary, allocationComparison, noZauthResults, withZauthResults } = result;

  const sections: string[] = [];

  // Header
  sections.push(`# Stage 2: Trading Signal Aggregation - Interleaved Comparison`);
  sections.push('');
  sections.push(`**Network:** ${network.toUpperCase()}`);
  sections.push(`**Timestamp:** ${timestamp}`);
  sections.push(`**Duration:** ${result.durationSeconds.toFixed(2)}s`);
  sections.push(`**Stage 1 Source:** ${stage1Path}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Executive Summary
  sections.push('## Executive Summary');
  sections.push('');
  sections.push(`Stage 2 ran an **interleaved comparison** between no-zauth and with-zauth modes on ${comparisonSummary.endpointsCompared} endpoints from Stage 1.`);
  sections.push('');
  sections.push(`**Key Finding:** With-zauth mode achieved **${comparisonSummary.burnReduction.toFixed(1)}% burn reduction** (net savings: $${comparisonSummary.totalNetSavings.toFixed(3)}).`);
  sections.push('');
  sections.push('### Comparison Results');
  sections.push('');
  sections.push('| Metric | No-Zauth | With-Zauth | Improvement |');
  sections.push('|--------|----------|------------|-------------|');
  sections.push(`| Total Spent | $${comparisonSummary.noZauth.totalSpent.toFixed(3)} | $${comparisonSummary.withZauth.totalSpent.toFixed(3)} | - |`);
  sections.push(`| Total Burn | $${comparisonSummary.noZauth.totalBurn.toFixed(3)} | $${comparisonSummary.withZauth.totalBurn.toFixed(3)} | $${comparisonSummary.totalBurnSavings.toFixed(3)} |`);
  sections.push(`| Burn Rate | ${(comparisonSummary.noZauth.burnRate * 100).toFixed(1)}% | ${(comparisonSummary.withZauth.burnRate * 100).toFixed(1)}% | ${comparisonSummary.burnReduction.toFixed(1)}% |`);
  sections.push(`| Zauth Cost | $0.000 | $${comparisonSummary.withZauth.zauthCost.toFixed(3)} | - |`);
  sections.push(`| **Net Savings** | **-** | **-** | **$${comparisonSummary.totalNetSavings.toFixed(3)}** |`);
  sections.push('');

  // Trading Recommendation Comparison
  sections.push('### Trading Recommendations');
  sections.push('');
  sections.push(`**No-Zauth:** ${allocationComparison.noZauth.poolId} (confidence: ${(allocationComparison.noZauth.confidence * 100).toFixed(1)}%)`);
  sections.push(`**With-Zauth:** ${allocationComparison.withZauth.poolId} (confidence: ${(allocationComparison.withZauth.confidence * 100).toFixed(1)}%)`);
  sections.push('');
  sections.push(`**Same Decision:** ${allocationComparison.sameDecision ? 'Yes ✓' : 'No ✗'}`);
  sections.push(`**Confidence Delta:** ${(allocationComparison.confidenceDelta * 100).toFixed(1)}%`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Methodology
  sections.push('## Methodology');
  sections.push('');
  sections.push('### Interleaved Comparison Approach');
  sections.push('');
  sections.push('Stage 2 uses an **interleaved comparison** to fairly evaluate no-zauth vs with-zauth modes:');
  sections.push('');
  sections.push('1. **Load Stage 1 endpoints** (402-enabled only)');
  sections.push('2. **Sort by price** (ascending) to maximize comparisons within budget');
  sections.push('3. **Distribute budget** across categories (33% pool, 33% whale, 34% sentiment)');
  sections.push('4. **For each endpoint** (until budget exhausted):');
  sections.push('   - Query with **no-zauth mode** (blind query)');
  sections.push('   - Query with **with-zauth mode** (reliability check first)');
  sections.push('   - Record per-endpoint comparison (burn savings, net savings)');
  sections.push('5. **Extract and validate data** from responses');
  sections.push('6. **Run trading signal algorithm** for both modes (aggregates sentiment + technical + liquidity)');
  sections.push('7. **Compare results** and generate reports');
  sections.push('');

  // Price Sorting Benefits
  sections.push('### Price Sorting Strategy');
  sections.push('');
  sections.push('Endpoints are sorted by price (cheapest first) to maximize statistical power:');
  sections.push('');
  sections.push('- **More comparisons per dollar**: Cheap endpoints allow more data points');
  sections.push('- **Better coverage**: Sample more of the endpoint ecosystem');
  sections.push('- **Fair comparison**: Both modes query same endpoints in same order');
  sections.push('');

  // Schema Validation
  sections.push('### Schema Validation');
  sections.push('');
  sections.push('Responses validated using hybrid approach:');
  sections.push('');
  sections.push('1. **Bazaar schema** (if available from metadata)');
  sections.push('2. **Pattern matching** fallback for common formats:');
  sections.push('   - `{ success: true, data: [...] }`');
  sections.push('   - `{ data: [...] }`');
  sections.push('   - `[...]` (direct array)');
  sections.push('   - `{ result: [...] }`');
  sections.push('   - `{ response: { data: [...] } }`');
  sections.push('');

  // Field Mapping
  sections.push('### Field Mapping & Normalization');
  sections.push('');
  sections.push('Data extracted using flexible field mappings:');
  sections.push('');
  sections.push('**Pool Data:**');
  sections.push('- `poolId`: `poolId`, `pool_id`, `id`, `address`');
  sections.push('- `tokenA/B`: `tokenA/B`, `token0/1`, `baseToken/quoteToken`');
  sections.push('- `tvl`: `tvl`, `totalValueLocked`, `liquidity`');
  sections.push('- `apy`: `apy`, `apr`, `yield` (auto-scaled: 50 → 0.50)');
  sections.push('');
  sections.push('**Whale Data:**');
  sections.push('- `wallet`: `wallet`, `address`, `from`');
  sections.push('- `action`: `action`, `type`, `event` (normalized to buy/sell/transfer)');
  sections.push('- `amount`: `amount`, `value`, `quantity`');
  sections.push('');
  sections.push('**Sentiment Data:**');
  sections.push('- `token`: `token`, `symbol`, `asset`');
  sections.push('- `score`: `score`, `sentiment`, `rating` (normalized to -1 to 1)');
  sections.push('- `confidence`: `confidence`, `weight` (auto-scaled: 85 → 0.85)');
  sections.push('');
  sections.push('---');
  sections.push('');

  // Detailed Results
  sections.push('## Detailed Results');
  sections.push('');

  // No-Zauth Results
  sections.push('### No-Zauth Mode');
  sections.push('');
  sections.push(`**Queries:** ${noZauthResults.queriesAttempted} attempted, ${noZauthResults.queriesFailed} failed`);
  sections.push(`**Burn:** $${noZauthResults.totalBurn.toFixed(3)} (${(noZauthResults.burnRate * 100).toFixed(1)}%)`);
  sections.push(`**Data Quality:** ${((noZauthResults.allocation.dataQuality || 0) * 100).toFixed(1)}%`);
  sections.push('');
  sections.push('**Data Extracted:**');
  sections.push(`- Pools: ${noZauthResults.poolData.length}`);
  sections.push(`- Whale Moves: ${noZauthResults.whaleData.length}`);
  sections.push(`- Sentiment Scores: ${noZauthResults.sentimentData.length}`);
  sections.push('');
  sections.push(`**Trading Recommendation:** ${allocationComparison.noZauth.poolId}`);
  sections.push(`**Reasoning:** ${allocationComparison.noZauth.reasoning}`);
  sections.push('');

  // With-Zauth Results
  sections.push('### With-Zauth Mode');
  sections.push('');
  sections.push(`**Queries:** ${withZauthResults.queriesAttempted} attempted, ${withZauthResults.queriesFailed} failed`);
  sections.push(`**Burn:** $${withZauthResults.totalBurn.toFixed(3)} (${(withZauthResults.burnRate * 100).toFixed(1)}%)`);
  sections.push(`**Zauth Cost:** $${withZauthResults.zauthCost.toFixed(3)}`);
  sections.push(`**Data Quality:** ${((withZauthResults.allocation.dataQuality || 0) * 100).toFixed(1)}%`);
  sections.push('');
  sections.push('**Data Extracted:**');
  sections.push(`- Pools: ${withZauthResults.poolData.length}`);
  sections.push(`- Whale Moves: ${withZauthResults.whaleData.length}`);
  sections.push(`- Sentiment Scores: ${withZauthResults.sentimentData.length}`);
  sections.push('');
  sections.push(`**Trading Recommendation:** ${allocationComparison.withZauth.poolId}`);
  sections.push(`**Reasoning:** ${allocationComparison.withZauth.reasoning}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Reproducibility
  sections.push('## Reproducibility');
  sections.push('');
  sections.push('To reproduce this comparison:');
  sections.push('');
  sections.push('```bash');
  sections.push(`npx tsx src/index.ts --agent --stage=2 --real \\`);
  sections.push(`  --budget=${comparisonSummary.budgetUsed.toFixed(2)} \\`);
  sections.push(`  --load-stage1=${stage1Path} \\`);
  sections.push(`  --network=${network}`);
  sections.push('```');
  sections.push('');
  sections.push('**Note:** Results may vary due to:');
  sections.push('- Endpoint availability changes');
  sections.push('- Price fluctuations');
  sections.push('- Network conditions');
  sections.push('');

  return sections.join('\n');
}

/**
 * Export Stage 2 results to structured folder
 */
export async function exportStage2Results(
  result: Stage2Result,
  paths: Stage2OutputPaths,
  network: Network,
  config: Config,
  stage1Path: string
): Promise<void> {
  // Create folder
  await fs.mkdir(paths.folderPath, { recursive: true });

  // Generate README
  const timestamp = new Date().toISOString();
  const readme = generateStage2ReadMe(result, network, config, timestamp, stage1Path);
  await fs.writeFile(paths.readmePath, readme, 'utf-8');

  // Export comparison summary
  await fs.writeFile(
    paths.comparisonSummaryPath,
    JSON.stringify(result.comparisonSummary, null, 2),
    'utf-8'
  );

  // Export endpoint comparisons
  await fs.writeFile(
    paths.endpointComparisonsPath,
    JSON.stringify(
      {
        endpointsCompared: result.endpointComparisons.length,
        comparisons: result.endpointComparisons.map(c => ({
          endpoint: {
            url: c.endpoint.url,
            name: c.endpoint.name,
            category: c.endpoint.category,
            price: c.endpoint.price,
            requested402Price: c.endpoint.requested402Price
          },
          noZauth: {
            success: c.noZauth.success,
            spent: c.noZauth.spent,
            burn: c.noZauth.burn,
            latency: c.noZauth.latency,
            validationUsed: c.noZauth.validationResult.schemaUsed,
            error: c.noZauth.error
          },
          withZauth: {
            success: c.withZauth.success,
            spent: c.withZauth.spent,
            burn: c.withZauth.burn,
            zauthCost: c.withZauth.zauthCost,
            skippedByZauth: c.withZauth.skippedByZauth,
            latency: c.withZauth.latency,
            validationUsed: c.withZauth.validationResult.schemaUsed,
            error: c.withZauth.error
          },
          burnSavings: c.burnSavings,
          netSavings: c.netSavings
        }))
      },
      null,
      2
    ),
    'utf-8'
  );

  // Export allocations comparison
  await fs.writeFile(
    paths.allocationsPath,
    JSON.stringify(result.allocationComparison, null, 2),
    'utf-8'
  );

  // Export no-zauth detailed results
  await fs.writeFile(
    paths.noZauthResultsPath,
    JSON.stringify(
      {
        allocation: result.noZauthResults.allocation,
        metrics: {
          totalSpent: result.noZauthResults.totalSpent,
          totalBurn: result.noZauthResults.totalBurn,
          burnRate: result.noZauthResults.burnRate,
          zauthCost: result.noZauthResults.zauthCost,
          queriesAttempted: result.noZauthResults.queriesAttempted,
          queriesFailed: result.noZauthResults.queriesFailed
        },
        poolData: result.noZauthResults.poolData,
        whaleData: result.noZauthResults.whaleData,
        sentimentData: result.noZauthResults.sentimentData
      },
      null,
      2
    ),
    'utf-8'
  );

  // Export with-zauth detailed results
  await fs.writeFile(
    paths.withZauthResultsPath,
    JSON.stringify(
      {
        allocation: result.withZauthResults.allocation,
        metrics: {
          totalSpent: result.withZauthResults.totalSpent,
          totalBurn: result.withZauthResults.totalBurn,
          burnRate: result.withZauthResults.burnRate,
          zauthCost: result.withZauthResults.zauthCost,
          queriesAttempted: result.withZauthResults.queriesAttempted,
          queriesFailed: result.withZauthResults.queriesFailed
        },
        poolData: result.withZauthResults.poolData,
        whaleData: result.withZauthResults.whaleData,
        sentimentData: result.withZauthResults.sentimentData
      },
      null,
      2
    ),
    'utf-8'
  );
}
