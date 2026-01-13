import { createObjectCsvWriter } from "csv-writer";
import Table from "cli-table3";
import { mkdirSync, existsSync } from "fs";
import type {
  Config,
  IterationResult,
  ExperimentSummary,
  ExperimentMode,
} from "./config.js";

export class MetricsCollector {
  private results: IterationResult[] = [];
  private config: Config;
  private totalSpent = 0;

  constructor(config: Config) {
    this.config = config;
  }

  addResult(result: IterationResult): void {
    this.results.push(result);
    this.totalSpent += result.spentUsdc;

    if (this.config.verbose) {
      this.logIteration(result);
    }
  }

  getTotalSpent(): number {
    return this.totalSpent;
  }

  isSpendLimitReached(): boolean {
    return this.totalSpent >= this.config.maxUsdcSpend;
  }

  private logIteration(result: IterationResult): void {
    const status = result.zauthSkipped
      ? "SKIP"
      : result.responseValid
        ? "OK"
        : "BURN";
    const statusColor =
      status === "OK" ? "\x1b[32m" : status === "SKIP" ? "\x1b[33m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(
      `[${result.iteration}] ${statusColor}${status}${reset} ` +
        `${result.endpoint.substring(0, 40)}... ` +
        `spent=$${result.spentUsdc.toFixed(4)} ` +
        `burn=$${result.burnUsdc.toFixed(4)} ` +
        `latency=${result.latencyMs}ms` +
        (result.skipReason ? ` (${result.skipReason})` : "")
    );
  }

  getSummary(mode: ExperimentMode): ExperimentSummary {
    const modeResults = this.results.filter((r) => r.mode === mode);

    const totalSpent = modeResults.reduce((sum, r) => sum + r.spentUsdc, 0);
    const totalBurn = modeResults.reduce((sum, r) => sum + r.burnUsdc, 0);
    const successes = modeResults.filter((r) => r.responseValid).length;
    const failures = modeResults.filter(
      (r) => r.paymentAttempted && !r.responseValid
    ).length;
    const skips = modeResults.filter((r) => r.zauthSkipped).length;
    const latencies = modeResults
      .filter((r) => r.paymentAttempted)
      .map((r) => r.latencyMs);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    // Calculate saved USDC (only meaningful for with-zauth mode)
    // This is the burn that would have occurred if we hadn't skipped
    const savedUsdc =
      mode === "with-zauth"
        ? modeResults
            .filter((r) => r.zauthSkipped)
            .reduce((sum, r) => sum + r.spentUsdc, 0) *
          this.config.mockFailureRate
        : 0;

    return {
      mode,
      totalIterations: modeResults.length,
      totalSpentUsdc: totalSpent,
      totalBurnUsdc: totalBurn,
      burnRate: totalSpent > 0 ? totalBurn / totalSpent : 0,
      successes,
      failures,
      skips,
      avgLatencyMs: avgLatency,
      savedUsdc,
    };
  }

  getComparativeSummary(): { noZauth: ExperimentSummary; withZauth: ExperimentSummary } {
    return {
      noZauth: this.getSummary("no-zauth"),
      withZauth: this.getSummary("with-zauth"),
    };
  }

  printSummaryTable(): void {
    const noZauth = this.getSummary("no-zauth");
    const withZauth = this.getSummary("with-zauth");
    const mock = this.getSummary("mock");

    // Use whichever has data
    const summaries = [noZauth, withZauth, mock].filter(
      (s) => s.totalIterations > 0
    );

    if (summaries.length === 0) {
      console.log("\nNo results to display.");
      return;
    }

    const table = new Table({
      head: ["Metric", ...summaries.map((s) => s.mode)],
      style: { head: ["cyan"] },
    });

    table.push(
      ["Iterations", ...summaries.map((s) => s.totalIterations.toString())],
      [
        "Total Spent (USDC)",
        ...summaries.map((s) => `$${s.totalSpentUsdc.toFixed(4)}`),
      ],
      [
        "Total Burn (USDC)",
        ...summaries.map((s) => `$${s.totalBurnUsdc.toFixed(4)}`),
      ],
      [
        "Burn Rate",
        ...summaries.map((s) => `${(s.burnRate * 100).toFixed(1)}%`),
      ],
      ["Successes", ...summaries.map((s) => s.successes.toString())],
      ["Failures", ...summaries.map((s) => s.failures.toString())],
      ["Skips (zauth)", ...summaries.map((s) => s.skips.toString())],
      [
        "Avg Latency (ms)",
        ...summaries.map((s) => s.avgLatencyMs.toFixed(0)),
      ],
      [
        "Saved (USDC)",
        ...summaries.map((s) => `$${s.savedUsdc.toFixed(4)}`),
      ]
    );

    console.log("\n" + "=".repeat(60));
    console.log("EXPERIMENT RESULTS");
    console.log("=".repeat(60));
    console.log(table.toString());

    // Print comparison if both modes have data
    if (noZauth.totalIterations > 0 && withZauth.totalIterations > 0) {
      const burnReduction =
        noZauth.burnRate > 0
          ? ((noZauth.burnRate - withZauth.burnRate) / noZauth.burnRate) * 100
          : 0;
      console.log("\n--- COMPARISON ---");
      console.log(
        `Burn reduction with zauth: ${burnReduction.toFixed(1)}%`
      );
      console.log(
        `Net savings: $${(noZauth.totalBurnUsdc - withZauth.totalBurnUsdc - withZauth.totalIterations * 0.005).toFixed(4)}`
      );
    }
  }

  async exportToCsv(): Promise<string> {
    const outputDir = this.config.outputDir;
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${outputDir}/experiment_${timestamp}.csv`;

    const csvWriter = createObjectCsvWriter({
      path: filename,
      header: [
        { id: "iteration", title: "Iteration" },
        { id: "timestamp", title: "Timestamp" },
        { id: "endpoint", title: "Endpoint" },
        { id: "mode", title: "Mode" },
        { id: "zauthChecked", title: "Zauth Checked" },
        { id: "zauthScore", title: "Zauth Score" },
        { id: "zauthSkipped", title: "Skipped" },
        { id: "skipReason", title: "Skip Reason" },
        { id: "paymentAttempted", title: "Payment Attempted" },
        { id: "paymentSucceeded", title: "Payment Succeeded" },
        { id: "responseValid", title: "Response Valid" },
        { id: "spentUsdc", title: "Spent (USDC)" },
        { id: "burnUsdc", title: "Burn (USDC)" },
        { id: "latencyMs", title: "Latency (ms)" },
        { id: "errorMessage", title: "Error" },
      ],
    });

    const records = this.results.map((r) => ({
      ...r,
      timestamp: r.timestamp.toISOString(),
      zauthScore: r.zauthScore?.toFixed(2) ?? "",
      skipReason: r.skipReason ?? "",
      spentUsdc: r.spentUsdc.toFixed(6),
      burnUsdc: r.burnUsdc.toFixed(6),
      errorMessage: r.errorMessage ?? "",
    }));

    await csvWriter.writeRecords(records);
    console.log(`\nResults exported to: ${filename}`);
    return filename;
  }

  getResults(): IterationResult[] {
    return [...this.results];
  }
}
