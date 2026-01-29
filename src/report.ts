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
