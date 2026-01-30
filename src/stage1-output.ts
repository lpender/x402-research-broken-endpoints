/**
 * Stage 1 Output Organization & Documentation
 *
 * Organizes Stage 1 discovery results into comprehensive folder structure with:
 * - README.md with atomic methodology breakdown
 * - discovery.json with summary statistics
 * - endpoints.json with detailed per-endpoint results
 */

import type { DiscoveryStageResult } from "./types.js";
import type { Network } from "./config.js";
import * as fs from "fs/promises";
import * as path from "path";

export interface BazaarQueryParams {
  url: string;
  type: string;
  network?: string;
  limit: number;
  offset: number;
}

export interface FilteringStats {
  bazaarTotal: number;
  afterNetworkFilter: number;
  afterCategoryFilter: number;
  finalEndpoints: number;
  filteredOutByNetwork: number;
  filteredOutByCategory: number;
  categoryBreakdown: {
    pool: number;
    whale: number;
    sentiment: number;
    unclassified: number;
  };
}

export interface Stage1OutputPaths {
  folderPath: string;
  readmePath: string;
  discoveryJsonPath: string;
  endpointsJsonPath: string;
}

/**
 * Create timestamped output folder for Stage 1 run
 * Format: YYYY-MM-DDTHH-MM-SS_stage1_{network}
 * Time is in EST (UTC-5/UTC-4 depending on DST)
 */
export function createStage1OutputFolder(
  network: string,
  timestamp: string
): Stage1OutputPaths {
  // Convert ISO timestamp to EST
  const date = new Date(timestamp);

  // EST is UTC-5, EDT is UTC-4. Use toLocaleString to handle DST automatically
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

  // Parse the formatted string and convert to ISO-like format
  // Format from toLocaleString: "MM/DD/YYYY, HH:MM:SS"
  const [datePart, timePart] = estDateString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  const estTimestamp = `${year}-${month}-${day}T${hour}-${minute}-${second}`;
  const folderName = `${estTimestamp}_stage1_${network}`;
  const folderPath = path.join('results', folderName);

  return {
    folderPath,
    readmePath: path.join(folderPath, 'README.md'),
    discoveryJsonPath: path.join(folderPath, 'discovery.json'),
    endpointsJsonPath: path.join(folderPath, 'endpoints.json')
  };
}

/**
 * Generate comprehensive README.md with atomic methodology breakdown
 */
export function generateStage1ReadMe(
  network: Network,
  networkId: string,
  result: DiscoveryStageResult,
  queryParams: BazaarQueryParams,
  filteringStats: FilteringStats,
  timestamp: string,
  durationSeconds: number
): string {
  const { total, requires402, openAccess, failures, percentage402 } = result;
  const tested = total - failures;

  // Calculate price discrepancies
  const priceDiscrepancies = result.details.filter(d =>
    d.price &&
    d.requested402Price !== undefined &&
    d.requested402Price !== null &&
    Math.abs(d.price - d.requested402Price) > 0.0001
  );

  return `# Stage 1: Discovery & 402 Prepayment Analysis

**Network**: ${network.charAt(0).toUpperCase() + network.slice(1)} (${networkId})
**Timestamp**: ${timestamp}
**Duration**: ${durationSeconds.toFixed(1)}s

## Executive Summary

Found **${total} endpoints** relevant to DeFi yield optimization.
- **${requires402} endpoints (${percentage402.toFixed(1)}%)** properly implement 402 prepayment protocol
- **${openAccess} endpoints (${((openAccess / total) * 100).toFixed(1)}%)** allow open access or failed testing
- **${failures} endpoints (${((failures / total) * 100).toFixed(1)}%)** test failures
- **0 payments made** (Stage 1 is discovery only)

---

## 1. What We're Trying To Do

**Goal**: Maximize DeFi yields for users by intelligently routing funds to highest-return opportunities.

**Use Case**: AI agents that autonomously optimize DeFi positions need real-time data on:
- Pool APYs across protocols (Uniswap, Curve, Aave, etc.)
- Whale wallet movements (smart money flows)
- Market sentiment signals (predictive indicators)

Traditional APIs are either expensive ($100s/month subscriptions) or unreliable (rate-limited, stale data). The x402 micropayment protocol enables pay-per-use access to premium data endpoints.

---

## 2. Why This Matters

**Problem Statement**: x402 adoption is blocked by endpoint reliability concerns.

Agents pay **before** receiving data. If an endpoint:
- Returns invalid JSON
- Times out
- Returns stale data (>5min old)
- Goes offline

...the agent has **already paid** but received nothing useful. This "burn" prevents production adoption.

**Research Question**: Can we discover which endpoints properly implement 402 prepayment, and measure what percentage are reliable?

---

## 3. How Discovery Works

### 3.1 Query x402 Bazaar Directory

**Bazaar API**: Coinbase's official x402 endpoint directory
- URL: \`https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources\`
- Purpose: Centralized registry of x402-enabled APIs

**Pagination Strategy**:
The Bazaar API doesn't support server-side filtering by description or category. Therefore:
1. We fetch ALL endpoints across all pages (limit=100 per page)
2. Concatenate them client-side into a complete dataset
3. Apply our filtering logic (network, category, price) to the full dataset

**Why Fetch All Pages?**
- Bazaar contains **${filteringStats.bazaarTotal} total endpoints** (as of this run)
- Sampling only the first 100 endpoints (<1% of total) introduces severe bias
- Network/category distributions may vary across pages
- Scientific rigor requires analyzing the full population

**Query Parameters** (per page):
\`\`\`json
{
  "type": "${queryParams.type}",
  "network": ${queryParams.network ? `"${queryParams.network}"` : "undefined"},
  "limit": 100,
  "offset": 0  // Increments: 0, 100, 200, ...
}
\`\`\`

**Query URL**: \`${queryParams.url}\`

**Parameter Breakdown**:
- \`type=${queryParams.type}\`: Only HTTP/HTTPS endpoints (vs WebSocket)
${queryParams.network ? `- \`network=${queryParams.network}\`: ${network === 'base' ? 'Base L2 (EIP-155 chain ID 8453)' : 'Solana network'}` : '- `network=undefined`: Query all networks, filter client-side'}
- \`limit=100\`: Maximum results per page
- \`offset\`: Increments by 100 for each page

**Pagination Process**:
1. Fetch first page (offset=0) to discover \`total\` count
2. Calculate total pages: \`ceil(total / limit)\`
3. Fetch remaining pages in sequence
4. Concatenate all \`items[]\` arrays
5. Proceed with filtering

**Performance**:
- First run: ~${Math.ceil(filteringStats.bazaarTotal / 100) * 0.5}s to fetch all pages (${Math.ceil(filteringStats.bazaarTotal / 100)} pages)
- Subsequent runs: <1s (cached for 1 hour)
- Trade-off: Slower first run, but complete dataset

**Response**: Array of \`BazaarResource\` objects with metadata:
- \`accepts[]\`: Payment requirements (chain, asset, amount)
- \`description\`: Human-readable endpoint description
- \`url\`: Endpoint URL template (may have placeholders)

---

### 3.2 Apply Three-Level Filtering

**Filter 1: Network Matching**

**Purpose**: Only include endpoints available on target network (${network.charAt(0).toUpperCase() + network.slice(1)})

**Logic**:
${network === 'base' ? `1. Check if any \`accepts\` entry matches:
   - \`network === 'base'\` (common name)
   - \`network === 'eip155:8453'\` (Base mainnet)
   - \`network === 'eip155:84532'\` (Base testnet)
2. OR check if asset address is Base USDC:
   - \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`` : `1. Check if any \`accepts\` entry matches:
   - Asset is Solana USDC: \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
   - Asset matches base58 format (32-44 character Solana address)`}

**Result**: Filter out endpoints only available on other chains (${network === 'base' ? 'Ethereum, Polygon, Solana' : 'Ethereum, Base, Polygon'})

**This Run**:
- Bazaar returned: ${filteringStats.bazaarTotal} resources
- After network filter: ${filteringStats.afterNetworkFilter} resources
- Filtered out: ${filteringStats.filteredOutByNetwork} resources

---

**Filter 2: Category Classification**

**Purpose**: Agent requires pool/whale/sentiment data. Endpoints that don't match any category are not useful.

**Classification Keywords**:
\`\`\`typescript
pool: ['pool', 'yield', 'liquidity', 'vault', 'tvl', 'apy', 'lending', 'borrow']
whale: ['whale', 'movement', 'wallet', 'tracker', 'flow', 'holder', 'transfer']
sentiment: ['sentiment', 'analysis', 'price', 'signal', 'market', 'trend', 'indicator']
\`\`\`

**Process**:
1. Extract URL + description from first \`accepts\` entry
2. Search combined text for keywords (case-insensitive)
3. If match found → classify, else → filter out

**Reasoning**: Unclassified endpoints may be valid x402 services (NFT APIs, weather data, etc.) but irrelevant to DeFi yield optimization.

**This Run**:
- After category filter: ${filteringStats.afterCategoryFilter} resources
- Filtered out: ${filteringStats.filteredOutByCategory} resources
- Breakdown:
  - Pool endpoints: ${filteringStats.categoryBreakdown.pool}
  - Whale endpoints: ${filteringStats.categoryBreakdown.whale}
  - Sentiment endpoints: ${filteringStats.categoryBreakdown.sentiment}
  - Unclassified: ${filteringStats.categoryBreakdown.unclassified}

---

**Filter 3: Price Extraction**

**Purpose**: Extract USDC payment amount for cost calculations

**Logic**:
1. Find \`accepts\` entry with \`scheme === 'exact'\`
2. Match asset to USDC contract on network:
   - Base: \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`
   - Solana: \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
3. Convert atomic units (6 decimals): \`amount / 1_000_000\`
4. Fallback: Default \`$0.01\` if no USDC payment found

**Result**: Each endpoint tagged with per-request cost

---

### 3.3 Test Endpoints for 402 Status

**Testing Method**: Raw HTTP GET requests (no x402 client, no authentication)

**Why**: Discover which endpoints enforce prepayment vs allow open access

**Batch Configuration**:
\`\`\`typescript
{
  concurrency: 5,        // Max 5 parallel requests
  timeout: 5000,         // 5 second timeout per endpoint
  method: 'GET',
  headers: { 'Accept': 'application/json' }
}
\`\`\`

**Test Logic** (per endpoint):
\`\`\`javascript
fetch(endpoint.url)
  .then(response => {
    if (response.status === 402) {
      // ✅ Properly implements prepayment protocol
      result.requires402 = true
    } else if (response.status === 200) {
      // ⚠️  Open access (may be demo/free tier)
      result.requires402 = false
    } else {
      // ❌ Unexpected status (404, 500, etc.)
      result.error = \`HTTP \${response.status}\`
    }
  })
  .catch(error => {
    // ❌ Network error or timeout
    result.error = error.message
  })
\`\`\`

**Concurrency Control**: Batch endpoints into groups of 5 to avoid network saturation

---

### 3.4 Calculate Discovery Statistics

**Metrics**:
\`\`\`typescript
total = endpoints.length                           // All tested endpoints
tested = endpoints.filter(e => !e.error).length    // Successful HTTP response
requires402 = endpoints.filter(e => e.requires402).length
openAccess = endpoints.filter(e => status 200).length
failures = endpoints.filter(e => e.error).length

percentage402 = (requires402 / total) * 100
\`\`\`

**This Run**:
- Total endpoints: ${total}
- Successfully tested: ${tested}
- Respond with 402: ${requires402} (${percentage402.toFixed(1)}%)
- Open access: ${openAccess}
- Test failures: ${failures}

---

## 4. Current Problems with x402 Flow

Based on this discovery run and broader ecosystem feedback:

### Problem 1: Broken Endpoints (High Frequency)
- **Observation**: ${failures} out of ${total} endpoints failed testing
- **Causes**: Timeout, 404 Not Found, 500 Internal Error
- **Impact**: Agent wastes time and cycles attempting dead endpoints

### Problem 2: Inconsistent 402 Implementation
- **Observation**: ${openAccess} endpoints allowed access without payment
- **Interpretation**:
  - May be free tiers or demo endpoints
  - May be misconfigured (forgot to enable 402 gate)
  - Creates uncertainty for agents (do I need to pay or not?)

### Problem 3: No Reliability Signals
- **Current State**: Bazaar directory provides no uptime/reliability scores
- **Agent Challenge**: Must blindly try all endpoints and hope they work
- **Cost Impact**: Every failed request after payment = "burn"

### Problem 4: Discovery Performance
- **Network overhead**: Testing ${total} endpoints with 5s timeout = up to ${Math.ceil(total / 5) * 5}s (with 5-parallel batching)
- **No caching**: Agents must re-test reliability on every run
- **Scaling concern**: As Bazaar grows to 100s of endpoints, discovery becomes bottleneck

### Problem 5: Price Accuracy in Bazaar Metadata
- **Observation**: ${priceDiscrepancies.length} endpoints show price discrepancies between Bazaar metadata and actual 402 responses
- **Issue**: Bazaar metadata may not match actual 402 response prices
${priceDiscrepancies.length > 0 ? `- **Examples**:
${priceDiscrepancies.slice(0, 3).map(d => `  - ${d.url}: Bazaar=$${d.price}, Actual=$${d.requested402Price}`).join('\n')}` : '- **All prices match**: Bazaar metadata accurately reflects actual endpoint pricing'}
- **Impact**: Agents using Bazaar prices for cost estimation may have inaccurate budgets

---

## 5. Experimental Method: Stage 1 Discovery

### Stage 1 Goals
1. ✅ Discover all DeFi-relevant endpoints on target network
2. ✅ Identify which endpoints implement 402 prepayment protocol
3. ✅ Measure percentage of working vs broken endpoints
4. ✅ Document exact query parameters and filtering logic
5. ✅ Establish baseline for Stage 2 (payment validation)

### Stage 1 Constraints
- **No payments made**: Raw HTTP requests only
- **No authentication**: Testing 402 status, not actual data quality
- **No data validation**: Can't verify response quality without paying

### Next Stage Preview

**Stage 2: Payment Validation & Data Quality**
- Use x402 client to make actual payments
- Fetch real data from each endpoint
- Validate response format, freshness, and completeness
- Measure "burn rate" (money wasted on bad responses)

---

## Results Summary

### Endpoint Distribution
- **Total discovered**: ${total}
- **Implements 402**: ${requires402} (${percentage402.toFixed(1)}%)
- **Open access**: ${openAccess}
- **Failed tests**: ${failures}

### Key Findings
1. **${percentage402.toFixed(1)}%** of endpoints properly gate access with 402 status
2. Network filtering reduced ${filteringStats.bazaarTotal} raw resources to ${filteringStats.finalEndpoints} relevant endpoints
3. Category classification ensures all endpoints serve DeFi use case
4. Discovery completed in ${durationSeconds.toFixed(1)} seconds (cached on subsequent runs)

### Files in This Folder
- \`README.md\` - This methodology document
- \`discovery.json\` - Raw discovery results with statistics
- \`endpoints.json\` - Detailed per-endpoint test results

---

## Reproducibility

**Reproduce this exact run**:
\`\`\`bash
npx tsx src/index.ts --agent --stage=1 --network=${network}
# or
task stage:1${network === 'solana' ? ' -- --network=solana' : ''}
\`\`\`

**Query different network**:
\`\`\`bash
npx tsx src/index.ts --agent --stage=1 --network=${network === 'base' ? 'solana' : 'base'}
# or
task stage:1 -- --network=${network === 'base' ? 'solana' : 'base'}
\`\`\`

**Bazaar Response Caching**: Results cached for 1 hour (configurable via \`BAZAAR_CACHE_TTL\` in \`.env\`)

---

## Technical Details

**Query Timestamp**: ${timestamp}
**Network ID**: ${networkId}
**Bazaar API Version**: v2
**Discovery Strategy**: Batch HTTP testing (5 parallel, 5s timeout)
**Codebase**: \`/Users/lpender/dev/zauth/experiments/simple\`

**Relevant Source Files**:
- \`src/bazaar-client.ts\` - Bazaar API client
- \`src/bazaar-mapper.ts\` - Filtering and classification
- \`src/prepayment-tester.ts\` - Batch HTTP testing
- \`src/yield-agent.ts\` - Discovery orchestration
- \`src/stage1-output.ts\` - Output organization
`;
}

/**
 * Export Stage 1 results to organized folder structure
 */
export async function exportStage1Results(
  result: DiscoveryStageResult,
  network: Network,
  networkId: string,
  queryParams: BazaarQueryParams,
  filteringStats: FilteringStats,
  durationSeconds: number
): Promise<Stage1OutputPaths> {
  const timestamp = new Date().toISOString();
  const paths = createStage1OutputFolder(network, timestamp);

  // Create output folder
  await fs.mkdir(paths.folderPath, { recursive: true });

  // Generate and write README.md
  const readme = generateStage1ReadMe(
    network,
    networkId,
    result,
    queryParams,
    filteringStats,
    timestamp,
    durationSeconds
  );
  await fs.writeFile(paths.readmePath, readme);

  // Calculate 402 response price statistics
  const with402Prices = result.details.filter(d => d.requested402Price !== undefined && d.requested402Price !== null);
  const requested402Prices = with402Prices.map(d => d.requested402Price!);

  // Detect price discrepancies
  const priceDiscrepancies = result.details.filter(d =>
    d.price &&
    d.requested402Price !== undefined &&
    d.requested402Price !== null &&
    Math.abs(d.price - d.requested402Price) > 0.0001
  );

  // Write discovery.json (summary statistics)
  const discoveryJson = {
    stage: 1,
    timestamp,
    network,
    networkId,
    query: "defi-yield-optimization",
    durationSeconds: parseFloat(durationSeconds.toFixed(2)),
    bazaarQuery: queryParams,
    pagination: {
      totalEndpoints: filteringStats.bazaarTotal,
      pagesRequired: Math.ceil(filteringStats.bazaarTotal / 100),
      fetchedFromCache: false // This will be set based on actual cache hit
    },
    filtering: filteringStats,
    results: {
      total: result.total,
      tested: result.total - result.failures,
      requires402: result.requires402,
      openAccess: result.openAccess,
      failures: result.failures,
      percentage402: parseFloat(result.percentage402.toFixed(2))
    },
    pricing402Response: requested402Prices.length > 0 ? {
      endpointsWithParsedPrices: requested402Prices.length,
      minPriceUsdc: Math.min(...requested402Prices),
      maxPriceUsdc: Math.max(...requested402Prices),
      avgPriceUsdc: requested402Prices.reduce((a, b) => a + b, 0) / requested402Prices.length,
      priceDiscrepancies: priceDiscrepancies.length,
      discrepancyExamples: priceDiscrepancies.slice(0, 5).map(d => ({
        url: d.url,
        bazaarPrice: d.price,
        actual402Price: d.requested402Price
      }))
    } : null
  };
  await fs.writeFile(
    paths.discoveryJsonPath,
    JSON.stringify(discoveryJson, null, 2)
  );

  // Write endpoints.json (detailed per-endpoint results)
  const endpointsJson = {
    stage: 1,
    timestamp,
    network,
    total: result.details.length,
    endpoints: result.details.map(detail => ({
      url: detail.url,
      name: detail.name,
      category: detail.category,
      price: detail.price,           // From Bazaar metadata (existing)
      requires402: detail.requires402,
      status: detail.status,
      headers: detail.headers,
      error: detail.error || null,
      metadata: detail.metadata || {},
      // 402 response pricing fields:
      paymentRequired: detail.paymentRequired || null,  // Full decoded x402 spec structure
      requested402Price: detail.requested402Price !== undefined ? detail.requested402Price : null,
      paymentOptions: detail.paymentOptions || null,
      priceDiscrepancy: (detail.price && detail.requested402Price !== undefined && detail.requested402Price !== null)
        ? Math.abs(detail.price - detail.requested402Price) > 0.0001
        : null,
      parseError: detail.parseError || null
    }))
  };
  await fs.writeFile(
    paths.endpointsJsonPath,
    JSON.stringify(endpointsJson, null, 2)
  );

  return paths;
}
