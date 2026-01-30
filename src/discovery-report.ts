/**
 * Stage 1: Discovery Report Generation
 *
 * Generates console and JSON reports for 402 prepayment discovery.
 */

import type { DiscoveryStageResult } from "./types.js";
import type { Network } from "./config.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Print discovery report to console.
 */
export function printDiscoveryReport(
  result: DiscoveryStageResult,
  network: Network
): void {
  console.log("\n" + "═".repeat(60));
  console.log("║ STAGE 1: DISCOVERY & 402 PREPAYMENT ANALYSIS".padEnd(59) + "║");
  console.log("═".repeat(60));

  console.log(`\nNetwork: ${network.toUpperCase()} (${network === 'base' ? 'eip155:8453' : 'solana'})`);
  console.log("Query: DeFi yield optimization endpoints");

  console.log("\nDiscovery Results:");
  console.log(`  Total endpoints found: ${result.total}`);
  console.log(`  Tested for 402: ${result.total - result.failures}`);
  console.log(`  Respond with 402: ${result.requires402} (${result.percentage402.toFixed(1)}%)`);
  console.log(`  Open access: ${result.openAccess} (${((result.openAccess / result.total) * 100).toFixed(1)}%)`);
  console.log(`  Test failures: ${result.failures} (${((result.failures / result.total) * 100).toFixed(1)}%)`);

  console.log("\nConclusion:");
  console.log(`  ${result.percentage402.toFixed(1)}% of endpoints properly implement 402 prepayment protocol`);

  console.log("\nNext Stage: Query endpoints with x402 payment to validate data quality");

  console.log("\n" + "═".repeat(60) + "\n");
}

/**
 * Export discovery results to JSON file.
 *
 * @param result - Discovery stage results
 * @param network - Network tested
 * @param outputPath - Output file path (default: results/discovery_<timestamp>.json)
 */
export async function exportDiscoveryJson(
  result: DiscoveryStageResult,
  network: Network,
  outputPath?: string
): Promise<string> {
  const timestamp = new Date().toISOString();
  const defaultPath = `results/discovery_${timestamp.replace(/[:.]/g, '-').slice(0, -5)}.json`;
  const filePath = outputPath || defaultPath;

  // Ensure output directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const output = {
    stage: 1,
    timestamp,
    network: network,
    networkId: network === 'base' ? 'eip155:8453' : 'solana',
    query: "defi-yield-optimization",
    results: {
      total: result.total,
      tested: result.total - result.failures,
      requires402: result.requires402,
      openAccess: result.openAccess,
      failures: result.failures,
      percentage402: parseFloat(result.percentage402.toFixed(2)),
    },
    endpoints: result.details.map(detail => ({
      url: detail.url,
      requires402: detail.requires402,
      status: detail.status,
      error: detail.error || null,
    })),
  };

  await fs.writeFile(filePath, JSON.stringify(output, null, 2));

  return filePath;
}

/**
 * Print detailed endpoint results (for verbose mode).
 */
export function printDetailedResults(result: DiscoveryStageResult): void {
  console.log("\n" + "─".repeat(60));
  console.log("DETAILED ENDPOINT RESULTS");
  console.log("─".repeat(60) + "\n");

  // Group by result type
  const requires402 = result.details.filter(d => d.requires402);
  const openAccess = result.details.filter(d => !d.requires402 && !d.error && d.status > 0);
  const failures = result.details.filter(d => d.error || d.status === 0);

  if (requires402.length > 0) {
    console.log(`✅ Endpoints with 402 Prepayment (${requires402.length}):`);
    requires402.forEach((detail, idx) => {
      console.log(`  ${idx + 1}. ${detail.url}`);
      console.log(`     Status: ${detail.status}`);
    });
    console.log("");
  }

  if (openAccess.length > 0) {
    console.log(`⚠️  Open Access Endpoints (${openAccess.length}):`);
    openAccess.forEach((detail, idx) => {
      console.log(`  ${idx + 1}. ${detail.url}`);
      console.log(`     Status: ${detail.status}`);
    });
    console.log("");
  }

  if (failures.length > 0) {
    console.log(`❌ Test Failures (${failures.length}):`);
    failures.forEach((detail, idx) => {
      console.log(`  ${idx + 1}. ${detail.url}`);
      console.log(`     Error: ${detail.error || 'Unknown error'}`);
    });
    console.log("");
  }

  console.log("─".repeat(60) + "\n");
}
