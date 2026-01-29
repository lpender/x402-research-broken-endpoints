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

  // Methodology
  sections.push("## Methodology");
  sections.push("");
  sections.push("### Agent Workflow");
  sections.push("");
  sections.push(
    "A YieldOptimizerAgent performed realistic DeFi yield optimization cycles, each involving:"
  );
  sections.push("");
  sections.push("1. **Pool data queries** - Fetch APY, TVL, volume from Raydium, Orca, Kamino endpoints");
  sections.push("2. **Whale activity queries** - Detect large position changes for market signals");
  sections.push("3. **Sentiment data queries** - Check market sentiment for tokens");
  sections.push("4. **Allocation calculation** - Optimize portfolio based on aggregated data");
  sections.push("");
  sections.push("Each query required an x402 micropayment. Failed or invalid responses caused \"burn\" (wasted cost).");
  sections.push("");

  sections.push("### Experimental Conditions");
  sections.push("");
  sections.push("**Control (no-zauth):**");
  sections.push("- Agent queries all endpoints directly via x402");
  sections.push("- All payments made regardless of endpoint reliability");
  sections.push("");
  sections.push("**Treatment (with-zauth):**");
  sections.push("- Agent checks Zauth reliability score before each query");
  sections.push("- Skips endpoints below 70% reliability threshold");
  sections.push("- Incurs small Zauth verification cost per check");
  sections.push("");

  sections.push("### Study Design");
  sections.push("");
  sections.push(`- **Trials per condition:** ${config.trialsPerCondition}`);
  sections.push(`- **Cycles per trial:** ${config.cyclesPerTrial}`);
  sections.push(`- **Total data points:** ${config.trialsPerCondition * config.cyclesPerTrial * 2} cycles`);
  sections.push(`- **Randomization:** Matched pairs with fixed random seeds for reproducibility`);
  sections.push(`- **Payment mode:** ${config.mockMode ? "Mock (simulated)" : "Real x402 payments"}`);
  if (metadata.gitCommitHash) {
    sections.push(`- **Code version:** ${metadata.gitCommitHash.slice(0, 8)}`);
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
  sections.push("- **Simulation:** " + (config.mockMode ? "Study used mock endpoints and simulated payments" : "Study used real x402 payments but mock endpoint behavior"));
  sections.push("- **Scope:** Limited to DeFi yield optimization workflow; results may differ for other use cases");
  sections.push("- **Endpoint reliability:** Study used fixed failure rates; real-world reliability varies over time");
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
