import Table from "cli-table3";
import * as fs from "fs";
import * as path from "path";
import type { StudyResults, StudyConfig } from "./types.js";
import { interpretEffectSize } from "./statistics.js";

export interface ReportGenerator {
  printSummaryTable(results: StudyResults): void;
  printStatisticalAnalysis(results: StudyResults): void;
  exportRawDataCsv(results: StudyResults, outputPath: string, config: StudyConfig): void;
  exportSummaryJson(results: StudyResults, outputPath: string, config: StudyConfig): void;
}

interface ExportMetadata {
  timestamp: string;
  config: StudyConfig;
  gitCommitHash?: string;
}

export function printSummaryTable(results: StudyResults): void {
  const table = new Table({
    head: [
      "Condition",
      "Trials",
      "Total Spent (USDC)",
      "Total Burn (USDC)",
      "Burn Rate (%)",
      "Net Savings (USDC)",
    ],
    colWidths: [15, 10, 20, 20, 15, 20],
  });

  const { noZauth, withZauth } = results;

  // No-zauth row
  table.push([
    "No Zauth",
    noZauth.trials.length.toString(),
    noZauth.avgTotalSpent.toFixed(4),
    noZauth.avgTotalBurn.toFixed(4),
    (noZauth.avgBurnRate * 100).toFixed(2),
    "-",
  ]);

  // With-zauth row
  const savings = noZauth.avgTotalBurn - withZauth.avgTotalBurn;
  table.push([
    "With Zauth",
    withZauth.trials.length.toString(),
    withZauth.avgTotalSpent.toFixed(4),
    withZauth.avgTotalBurn.toFixed(4),
    (withZauth.avgBurnRate * 100).toFixed(2),
    savings.toFixed(4),
  ]);

  // Comparison row
  const burnReduction = results.burnReductionPercent;
  table.push([
    {
      colSpan: 4,
      content: "Burn Reduction",
      hAlign: "right",
    },
    `${burnReduction.toFixed(2)}%`,
    `${savings.toFixed(4)}`,
  ]);

  console.log("\n=== Summary Table ===");
  console.log(table.toString());
}

export function printStatisticalAnalysis(results: StudyResults): void {
  const table = new Table({
    head: ["Metric", "Value", "Interpretation"],
    colWidths: [25, 20, 50],
  });

  // Burn reduction
  table.push([
    "Burn Reduction",
    `${results.burnReductionPercent.toFixed(2)}%`,
    `Zauth reduces burn by ${results.burnReductionPercent.toFixed(1)}% on average`,
  ]);

  // Confidence interval
  const [ciLower, ciUpper] = results.confidenceInterval95;
  table.push([
    "95% Confidence Interval",
    `[${ciLower.toFixed(2)}%, ${ciUpper.toFixed(2)}%]`,
    `True reduction is between ${ciLower.toFixed(1)}% and ${ciUpper.toFixed(1)}% with 95% confidence`,
  ]);

  // P-value
  const significant = results.pValue < 0.05;
  table.push([
    "P-value",
    results.pValue.toFixed(4),
    significant
      ? "Statistically significant (p < 0.05)"
      : "Not statistically significant (p >= 0.05)",
  ]);

  // Effect size
  const effectInterpretation = interpretEffectSize(results.effectSize);
  table.push([
    "Effect Size (Cohen's d)",
    results.effectSize.toFixed(3),
    `${effectInterpretation.charAt(0).toUpperCase() + effectInterpretation.slice(1)} effect`,
  ]);

  // Net savings per cycle
  table.push([
    "Net Savings per Cycle",
    `$${results.netSavingsPerCycle.toFixed(4)}`,
    `Average savings per optimization cycle`,
  ]);

  // Break-even failure rate
  table.push([
    "Break-even Failure Rate",
    `${(results.breakEvenFailureRate * 100).toFixed(2)}%`,
    `Zauth breaks even when endpoint failure rate exceeds this threshold`,
  ]);

  console.log("\n=== Statistical Analysis ===");
  console.log(table.toString());
}

export function printFullReport(results: StudyResults): void {
  printSummaryTable(results);
  printStatisticalAnalysis(results);
  console.log("");
}

function getGitCommitHash(): string | undefined {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch (error) {
    return undefined;
  }
}

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function exportRawDataCsv(
  results: StudyResults,
  outputPath: string,
  config: StudyConfig
): void {
  ensureDirectoryExists(outputPath);

  const metadata: ExportMetadata = {
    timestamp: new Date().toISOString(),
    config,
    gitCommitHash: getGitCommitHash(),
  };

  // CSV header
  const headers = [
    "condition",
    "trial",
    "cycle",
    "spentUsdc",
    "burnUsdc",
    "zauthCostUsdc",
    "queriesAttempted",
    "queriesFailed",
    "latencyMs",
  ];

  const rows: string[] = [headers.join(",")];

  // Add metadata as comments
  rows.unshift(`# Timestamp: ${metadata.timestamp}`);
  rows.unshift(`# Trials per condition: ${config.trialsPerCondition}`);
  rows.unshift(`# Cycles per trial: ${config.cyclesPerTrial}`);
  rows.unshift(`# Base seed: ${config.baseSeed}`);
  rows.unshift(`# Mock mode: ${config.mockMode}`);
  if (metadata.gitCommitHash) {
    rows.unshift(`# Git commit: ${metadata.gitCommitHash}`);
  }
  rows.unshift("# Scientific Study Raw Data");
  rows.push(""); // Blank line after metadata

  // No-zauth data
  results.noZauth.trials.forEach((trial, trialIdx) => {
    trial.metrics.forEach((cycle, cycleIdx) => {
      rows.push(
        [
          "no-zauth",
          trialIdx,
          cycleIdx,
          cycle.spentUsdc,
          cycle.burnUsdc,
          cycle.zauthCostUsdc,
          cycle.queriesAttempted,
          cycle.queriesFailed,
          cycle.latencyMs,
        ].join(",")
      );
    });
  });

  // With-zauth data
  results.withZauth.trials.forEach((trial, trialIdx) => {
    trial.metrics.forEach((cycle, cycleIdx) => {
      rows.push(
        [
          "with-zauth",
          trialIdx,
          cycleIdx,
          cycle.spentUsdc,
          cycle.burnUsdc,
          cycle.zauthCostUsdc,
          cycle.queriesAttempted,
          cycle.queriesFailed,
          cycle.latencyMs,
        ].join(",")
      );
    });
  });

  fs.writeFileSync(outputPath, rows.join("\n"));
  console.log(`Raw data exported to: ${outputPath}`);
}

export function exportSummaryJson(
  results: StudyResults,
  outputPath: string,
  config: StudyConfig
): void {
  ensureDirectoryExists(outputPath);

  const metadata: ExportMetadata = {
    timestamp: new Date().toISOString(),
    config,
    gitCommitHash: getGitCommitHash(),
  };

  const output = {
    metadata,
    results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Summary JSON exported to: ${outputPath}`);
}

export function generateMarkdownReport(
  results: StudyResults,
  outputPath: string,
  config: StudyConfig
): void {
  ensureDirectoryExists(outputPath);

  const metadata: ExportMetadata = {
    timestamp: new Date().toISOString(),
    config,
    gitCommitHash: getGitCommitHash(),
  };

  const sections: string[] = [];

  // Title and metadata
  sections.push("# Zauth x402 Burn Reduction Scientific Study");
  sections.push("");
  sections.push(`**Date:** ${new Date(metadata.timestamp).toLocaleDateString()}`);
  sections.push(`**Study ID:** ${metadata.gitCommitHash?.slice(0, 8) || "unknown"}`);
  sections.push("");

  // Executive Summary
  sections.push("## Executive Summary");
  sections.push("");
  const burnReduction = results.burnReductionPercent;
  const [ciLower, ciUpper] = results.confidenceInterval95;
  const significant = results.pValue < 0.05;
  const effectInterpretation = interpretEffectSize(results.effectSize);

  sections.push(
    `This study measured the cost savings (\"burn reduction\") achieved by using Zauth x402 endpoint verification ` +
    `in a realistic DeFi yield optimization workflow. Over ${config.trialsPerCondition} trials per condition, ` +
    `with ${config.cyclesPerTrial} optimization cycles per trial, we found that:`
  );
  sections.push("");
  sections.push(`- **Burn reduction:** ${burnReduction.toFixed(2)}% (95% CI: [${ciLower.toFixed(2)}%, ${ciUpper.toFixed(2)}%])`);
  sections.push(`- **Statistical significance:** ${significant ? "Yes" : "No"} (p = ${results.pValue.toFixed(4)})`);
  sections.push(`- **Effect size:** ${effectInterpretation} (Cohen's d = ${results.effectSize.toFixed(3)})`);
  sections.push(`- **Net savings per cycle:** $${results.netSavingsPerCycle.toFixed(4)} USDC`);
  sections.push("");

  if (significant && burnReduction > 0) {
    sections.push(
      `**Conclusion:** Zauth x402 verification provides statistically significant cost savings by preventing ` +
      `payments to unreliable endpoints. The ${effectInterpretation} effect size indicates this is a ` +
      `${effectInterpretation === "large" ? "substantial" : "meaningful"} real-world benefit.`
    );
  } else if (burnReduction > 0) {
    sections.push(
      `**Conclusion:** While the data suggests a trend toward cost savings (${burnReduction.toFixed(1)}%), ` +
      `the results did not reach statistical significance (p = ${results.pValue.toFixed(4)}). ` +
      `A larger study may be needed to confirm these findings.`
    );
  } else {
    sections.push(
      `**Conclusion:** No burn reduction was observed in this study. This may indicate that endpoint ` +
      `reliability was high enough that Zauth verification costs exceeded savings.`
    );
  }
  sections.push("");

  // Background
  sections.push("## Background: Why DeFi Yield Optimization?");
  sections.push("");
  sections.push(
    "**DeFi yield optimization is a canonical use case for autonomous agents** that need to aggregate real-time " +
    "data from multiple paid APIs. This mirrors real-world agent behavior where:"
  );
  sections.push("");
  sections.push("1. **Agents need diverse data sources** - Pool metrics, whale activity, market sentiment");
  sections.push("2. **Data comes from x402-paywalled APIs** - Each query costs micropayments");
  sections.push("3. **Endpoint reliability varies** - Some APIs go offline, return stale data, or fail intermittently");
  sections.push("4. **Failed queries cost money** - Paying for invalid data is \"burn\" (wasted spend)");
  sections.push("");
  sections.push(
    "This study tests whether **Zauth endpoint verification reduces burn** by helping agents avoid " +
    "unreliable endpoints before making costly x402 payments."
  );
  sections.push("");

  // Methodology
  sections.push("## Methodology");
  sections.push("");

  sections.push("### Endpoint Discovery");
  sections.push("");
  const usedBazaar = config.bazaarClient !== undefined;
  const network = config.network || "base";

  if (usedBazaar) {
    sections.push(
      "**Endpoints were dynamically discovered using Coinbase x402 Bazaar API:**"
    );
    sections.push("");
    sections.push(`- **Discovery service:** Coinbase x402 Bazaar (\`${network}\` network)`);
    sections.push("- **Category classification:** Automated keyword matching (pool/whale/sentiment)");
    sections.push("- **Price extraction:** USDC atomic units → decimal conversion");
    sections.push("- **Caching:** 1-hour TTL to minimize Bazaar API calls");
    sections.push("- **Fallback:** Static registry used if Bazaar unavailable");
    sections.push("");
    sections.push(
      "This tests the **real-world scenario** where agents discover x402 APIs from a registry " +
      "without prior knowledge of reliability."
    );
  } else {
    sections.push("**Endpoints were selected from a static registry:**");
    sections.push("");
    sections.push(`- **Network:** ${network.toUpperCase()}`);
    sections.push(`- **Source:** Curated endpoint registry (src/real-endpoints.ts)`);
    sections.push("- **Categories:** Pool data, whale tracking, sentiment analysis");
    sections.push("- **Selection:** One endpoint per category (3 total per cycle)");
  }
  sections.push("");

  sections.push("### Agent Workflow: DeFi Yield Optimizer");
  sections.push("");
  sections.push(
    "The `YieldOptimizerAgent` simulates a realistic autonomous agent making DeFi investment decisions. " +
    "Each optimization cycle follows this workflow:"
  );
  sections.push("");
  sections.push("#### 1. Data Aggregation Phase");
  sections.push("");
  sections.push(
    "The agent queries three categories of x402-paywalled endpoints (one endpoint per category):"
  );
  sections.push("");
  sections.push("**Pool Data Endpoints** (liquidity pools, vaults):");
  sections.push("- Fetches: APY, TVL, 24h volume, fee rate, token pair");
  sections.push("- Example: Raydium, Orca, Kamino liquidity pool analytics");
  sections.push("- Purpose: Identify high-yield opportunities");
  sections.push("");
  sections.push("**Whale Activity Endpoints** (large wallet movements):");
  sections.push("- Fetches: Wallet address, action (buy/sell/transfer), token, amount, timestamp");
  sections.push("- Example: On-chain trackers monitoring wallets with >$1M positions");
  sections.push("- Purpose: Detect smart money flow and market signals");
  sections.push("");
  sections.push("**Sentiment Data Endpoints** (market analysis):");
  sections.push("- Fetches: Token sentiment score (-1 to 1), confidence, data sources");
  sections.push("- Example: Social media analysis, price momentum indicators");
  sections.push("- Purpose: Gauge market sentiment and risk");
  sections.push("");
  sections.push(
    "**Cost:** Each query costs ~$0.01-0.03 USDC via x402 micropayment. " +
    "Failed or invalid responses still incur payment costs (\"burn\")."
  );
  sections.push("");

  sections.push("#### 2. Allocation Calculation Phase");
  sections.push("");
  sections.push(
    "The agent synthesizes all data to select the optimal liquidity pool allocation using a **multi-factor scoring algorithm:**"
  );
  sections.push("");
  sections.push("```");
  sections.push("score = (apy_normalized × 0.4)           // Base yield");
  sections.push("      + (tvl_score × 0.2)                // Safety (higher TVL = lower risk)");
  sections.push("      + (volume_score × 0.1)             // Liquidity quality");
  sections.push("      - (il_risk_penalty)                // Impermanent loss risk");
  sections.push("      + (whale_buy_signal × 0.1)         // Smart money confirmation");
  sections.push("      + (sentiment_weighted × 0.2)       // Market sentiment boost");
  sections.push("      × data_quality_multiplier          // Penalize missing data");
  sections.push("```");
  sections.push("");
  sections.push("**Data quality penalty:** Missing or failed queries reduce confidence in the allocation.");
  sections.push("");
  sections.push(
    "**Output:** The highest-scoring pool receives a recommended allocation percentage with reasoning."
  );
  sections.push("");

  sections.push("### Experimental Conditions");
  sections.push("");
  sections.push("#### Control: No-Zauth");
  sections.push("");
  sections.push("- Agent queries **all 3 endpoints** directly via x402 payments");
  sections.push("- No reliability checks performed");
  sections.push("- All payments made regardless of endpoint health");
  sections.push("- Failed queries result in 100% burn (payment made, no valid data received)");
  sections.push("");

  sections.push("#### Treatment: With-Zauth");
  sections.push("");
  sections.push("- Agent checks **Zauth reliability score** before each query:");
  sections.push("  - Queries Zauth API for endpoint uptime percentage");
  sections.push("  - Cost: ~$0.001 USDC per Zauth check (10x cheaper than x402 query)");
  sections.push("- **Filtering rule:** Skip endpoints with <70% uptime");
  sections.push("  - Avoids wasting x402 payment on likely-failed endpoints");
  sections.push("  - Agent proceeds with partial data if endpoints are unreliable");
  sections.push("- **Tradeoff:** Small Zauth cost vs. avoiding large burn on failed queries");
  sections.push("");
  sections.push(
    "**Hypothesis:** Zauth costs < burn savings when endpoint failure rates are significant."
  );
  sections.push("");

  sections.push("### Technology Stack");
  sections.push("");
  sections.push("- **x402 Protocol:** Micropayments for API access (EIP-402 / SIP-402)");
  sections.push(`- **Network:** ${network.toUpperCase()} (${network === "base" ? "Ethereum L2" : "Solana L1"})`);
  sections.push(`- **Payment Client:** @x402/${network === "base" ? "evm" : "svm"} (${network === "base" ? "viem" : "Solana Kit"})`);
  sections.push("- **Zauth API:** Endpoint health monitoring service");
  sections.push(usedBazaar ? "- **Discovery:** Coinbase x402 Bazaar dynamic endpoint registry" : "- **Discovery:** Static endpoint registry");
  sections.push("");

  sections.push("### Study Design");
  sections.push("");
  sections.push(`- **Trials per condition:** ${config.trialsPerCondition} (matched pairs)`);
  sections.push(`- **Cycles per trial:** ${config.cyclesPerTrial} (optimization rounds)`);
  sections.push(`- **Total data points:** ${config.trialsPerCondition * config.cyclesPerTrial * 2} cycles`);
  sections.push(`- **Randomization:** Fixed random seed for reproducibility`);
  sections.push(`- **Payment mode:** ${config.mockMode ? "Mock (simulated x402 payments)" : "Real x402 payments on " + network.toUpperCase()}`);
  sections.push(`- **Endpoint queries:** 3 per cycle (pool + whale + sentiment)`);
  const totalQueries = config.trialsPerCondition * config.cyclesPerTrial * 3 * 2;
  sections.push(`- **Total queries:** ${totalQueries} x402 API calls across both conditions`);
  if (metadata.gitCommitHash) {
    sections.push(`- **Code version:** \`${metadata.gitCommitHash}\``);
  }
  sections.push("");

  // Results
  sections.push("## Results");
  sections.push("");

  sections.push("### Summary Statistics");
  sections.push("");
  sections.push("| Condition | Trials | Avg Total Spent (USDC) | Avg Total Burn (USDC) | Burn Rate | Net Savings (USDC) |");
  sections.push("|-----------|--------|------------------------|------------------------|-----------|---------------------|");
  sections.push(
    `| No Zauth | ${results.noZauth.trials.length} | ` +
    `${results.noZauth.avgTotalSpent.toFixed(4)} | ` +
    `${results.noZauth.avgTotalBurn.toFixed(4)} | ` +
    `${(results.noZauth.avgBurnRate * 100).toFixed(2)}% | ` +
    `- |`
  );
  const savings = results.noZauth.avgTotalBurn - results.withZauth.avgTotalBurn;
  sections.push(
    `| With Zauth | ${results.withZauth.trials.length} | ` +
    `${results.withZauth.avgTotalSpent.toFixed(4)} | ` +
    `${results.withZauth.avgTotalBurn.toFixed(4)} | ` +
    `${(results.withZauth.avgBurnRate * 100).toFixed(2)}% | ` +
    `${savings.toFixed(4)} |`
  );
  sections.push(
    `| **Reduction** | - | - | - | **${burnReduction.toFixed(2)}%** | **${savings.toFixed(4)}** |`
  );
  sections.push("");

  // Statistical Analysis
  sections.push("### Statistical Analysis");
  sections.push("");
  sections.push("| Metric | Value | Interpretation |");
  sections.push("|--------|-------|----------------|");
  sections.push(
    `| Burn Reduction | ${burnReduction.toFixed(2)}% | ` +
    `Zauth reduces burn by ${burnReduction.toFixed(1)}% on average |`
  );
  sections.push(
    `| 95% Confidence Interval | [${ciLower.toFixed(2)}%, ${ciUpper.toFixed(2)}%] | ` +
    `True reduction is between ${ciLower.toFixed(1)}% and ${ciUpper.toFixed(1)}% with 95% confidence |`
  );
  sections.push(
    `| P-value | ${results.pValue.toFixed(4)} | ` +
    `${significant ? "Statistically significant (p < 0.05)" : "Not statistically significant (p >= 0.05)"} |`
  );
  sections.push(
    `| Effect Size (Cohen's d) | ${results.effectSize.toFixed(3)} | ` +
    `${effectInterpretation.charAt(0).toUpperCase() + effectInterpretation.slice(1)} effect |`
  );
  sections.push(
    `| Net Savings per Cycle | $${results.netSavingsPerCycle.toFixed(4)} | ` +
    `Average savings per optimization cycle |`
  );
  sections.push(
    `| Break-even Failure Rate | ${(results.breakEvenFailureRate * 100).toFixed(2)}% | ` +
    `Zauth breaks even when endpoint failure rate exceeds this threshold |`
  );
  sections.push("");

  // Detailed Findings
  sections.push("### Detailed Findings");
  sections.push("");
  sections.push(`**No-Zauth Condition:**`);
  sections.push(`- Average queries per trial: ${results.noZauth.avgQueriesAttempted.toFixed(1)}`);
  sections.push(`- Average failures per trial: ${results.noZauth.avgQueriesFailed.toFixed(1)}`);
  sections.push(`- Failure rate: ${((results.noZauth.avgQueriesFailed / results.noZauth.avgQueriesAttempted) * 100).toFixed(2)}%`);
  sections.push("");
  sections.push(`**With-Zauth Condition:**`);
  sections.push(`- Average queries per trial: ${results.withZauth.avgQueriesAttempted.toFixed(1)}`);
  sections.push(`- Average failures per trial: ${results.withZauth.avgQueriesFailed.toFixed(1)}`);
  sections.push(`- Failure rate: ${((results.withZauth.avgQueriesFailed / results.withZauth.avgQueriesAttempted) * 100).toFixed(2)}%`);
  sections.push(`- Queries avoided by Zauth filtering: ${(results.noZauth.avgQueriesAttempted - results.withZauth.avgQueriesAttempted).toFixed(1)} per trial`);
  sections.push("");

  // Conclusions
  sections.push("## Conclusions");
  sections.push("");

  if (significant && burnReduction > 0) {
    sections.push(
      `This study provides ${significant ? "statistically significant" : "preliminary"} evidence that Zauth x402 ` +
      `endpoint verification reduces burn in DeFi yield optimization workflows by ${burnReduction.toFixed(1)}%. ` +
      `The ${effectInterpretation} effect size suggests this benefit is ${effectInterpretation === "large" ? "substantial" : "meaningful"} in practice.`
    );
    sections.push("");
    sections.push("**Key Takeaways:**");
    sections.push("");
    sections.push(
      `1. **Cost savings:** Agents using Zauth avoid paying for ${burnReduction.toFixed(1)}% of invalid responses`
    );
    sections.push(
      `2. **Net benefit:** After accounting for Zauth verification costs, net savings are $${results.netSavingsPerCycle.toFixed(4)} per cycle`
    );
    sections.push(
      `3. **Break-even threshold:** Zauth is cost-effective when endpoint failure rates exceed ${(results.breakEvenFailureRate * 100).toFixed(1)}%`
    );
    sections.push(
      `4. **Reproducibility:** Study used fixed random seeds for deterministic results`
    );
  } else {
    sections.push(
      `This study found ${burnReduction > 0 ? "a trend toward" : "no evidence of"} burn reduction ` +
      `with Zauth x402 verification. ${!significant && burnReduction > 0 ? "While the observed reduction was " + burnReduction.toFixed(1) + "%, " : ""}` +
      `${!significant ? "The results did not reach statistical significance. " : ""}` +
      `Further investigation with ${!significant ? "larger sample sizes or " : ""}different endpoint reliability profiles may be warranted.`
    );
  }
  sections.push("");

  // Limitations
  sections.push("## Limitations");
  sections.push("");
  sections.push("### Study Scope");
  sections.push("- **Use case specificity:** Results apply to DeFi yield optimization workflows requiring 3-5 diverse APIs");
  sections.push("- **Agent type:** Autonomous agents with data aggregation needs; may differ for API-to-API integrations");
  sections.push("- **Endpoint failure patterns:** Tested with " + (config.mockMode ? "simulated" : "real") + " endpoint reliability; actual patterns vary by provider");
  sections.push("");
  sections.push("### Technical Constraints");
  sections.push("- **Payment mode:** " + (config.mockMode ? "Mock x402 payments (simulated costs)" : `Real x402 payments on ${network.toUpperCase()}`));
  sections.push("- **Endpoint discovery:** " + (usedBazaar ? "Bazaar-discovered endpoints (reliability unknown)" : "Curated static registry (known endpoints)"));
  sections.push("- **Network coverage:** Single network tested (" + network.toUpperCase() + "); cross-chain behavior not evaluated");
  sections.push("- **Time window:** Snapshot study; long-term endpoint reliability drift not captured");
  sections.push("");
  sections.push("### Statistical Limitations");
  sections.push(`- **Sample size:** ${config.trialsPerCondition} trials per condition; larger N improves power`);
  sections.push("- **Variance:** Wide confidence intervals suggest more trials needed for precise estimates");
  sections.push("- **Matched pairs:** Same random seed ensures fair comparison but limits generalizability");
  sections.push("");

  // Reproducibility
  sections.push("## Reproducibility");
  sections.push("");
  sections.push("This study can be reproduced using:");
  sections.push("");
  sections.push("```bash");
  sections.push(
    `npx tsx src/index.ts --study --trials=${config.trialsPerCondition} --cycles=${config.cyclesPerTrial} --seed=${config.baseSeed}`
  );
  sections.push("```");
  sections.push("");
  if (metadata.gitCommitHash) {
    sections.push(`Code version: \`${metadata.gitCommitHash}\``);
    sections.push("");
  }

  // Footer
  sections.push("---");
  sections.push("");
  sections.push(`*Generated on ${metadata.timestamp}*`);
  sections.push("");

  fs.writeFileSync(outputPath, sections.join("\n"));
  console.log(`Markdown report exported to: ${outputPath}`);
}
