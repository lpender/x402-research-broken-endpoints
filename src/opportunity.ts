import Table from "cli-table3";

export interface OpportunitySizingParams {
  // Market assumptions
  dailyX402Transactions: number; // Projected daily x402 txs
  avgPaymentUsdc: number; // Average payment per transaction
  endpointFailureRate: number; // % of endpoints that fail/return garbage

  // Zauth assumptions
  zauthCheckCostUsdc: number; // Cost per zauth check ($0.005)
  zauthMarketPenetration: number; // % of queries that use zauth (0.10-0.20)
  stakerRevenueShare: number; // % of revenue shared with stakers (0.70)
}

export interface OpportunitySizingResult {
  // Without zauth (baseline)
  dailyWastedUsdc: number;
  annualWastedUsdc: number;

  // With zauth
  dailyZauthQueries: number;
  dailyZauthRevenue: number;
  annualZauthRevenue: number;

  // Staker returns
  dailyStakerRevenue: number;
  annualStakerRevenue: number;

  // User savings
  dailyUserSavings: number;
  annualUserSavings: number;
  netSavingsPerQuery: number;
}

export function calculateOpportunitySizing(
  params: OpportunitySizingParams
): OpportunitySizingResult {
  // Calculate daily waste without zauth
  const dailyWastedUsdc =
    params.dailyX402Transactions *
    params.avgPaymentUsdc *
    params.endpointFailureRate;
  const annualWastedUsdc = dailyWastedUsdc * 365;

  // Calculate zauth usage
  const dailyZauthQueries =
    params.dailyX402Transactions * params.zauthMarketPenetration;
  const dailyZauthRevenue = dailyZauthQueries * params.zauthCheckCostUsdc;
  const annualZauthRevenue = dailyZauthRevenue * 365;

  // Calculate staker returns
  const dailyStakerRevenue = dailyZauthRevenue * params.stakerRevenueShare;
  const annualStakerRevenue = dailyStakerRevenue * 365;

  // Calculate user savings (waste prevented minus zauth cost)
  const wastePrevented =
    dailyZauthQueries * params.avgPaymentUsdc * params.endpointFailureRate;
  const zauthCost = dailyZauthQueries * params.zauthCheckCostUsdc;
  const dailyUserSavings = wastePrevented - zauthCost;
  const annualUserSavings = dailyUserSavings * 365;
  const netSavingsPerQuery =
    params.avgPaymentUsdc * params.endpointFailureRate -
    params.zauthCheckCostUsdc;

  return {
    dailyWastedUsdc,
    annualWastedUsdc,
    dailyZauthQueries,
    dailyZauthRevenue,
    annualZauthRevenue,
    dailyStakerRevenue,
    annualStakerRevenue,
    dailyUserSavings,
    annualUserSavings,
    netSavingsPerQuery,
  };
}

export function printOpportunitySizing(
  params: OpportunitySizingParams,
  experimentBurnRate?: number
): void {
  // If we have experiment data, use it to adjust failure rate
  const adjustedParams = experimentBurnRate
    ? { ...params, endpointFailureRate: experimentBurnRate }
    : params;

  const result = calculateOpportunitySizing(adjustedParams);

  console.log("\n" + "=".repeat(60));
  console.log("OPPORTUNITY SIZING");
  console.log("=".repeat(60));

  const assumptionsTable = new Table({
    head: ["Assumption", "Value"],
    style: { head: ["cyan"] },
  });

  assumptionsTable.push(
    [
      "Daily x402 Transactions",
      formatNumber(adjustedParams.dailyX402Transactions),
    ],
    ["Avg Payment per Tx", `$${adjustedParams.avgPaymentUsdc.toFixed(3)}`],
    [
      "Endpoint Failure Rate",
      `${(adjustedParams.endpointFailureRate * 100).toFixed(1)}%${experimentBurnRate ? " (from experiment)" : ""}`,
    ],
    ["Zauth Check Cost", `$${adjustedParams.zauthCheckCostUsdc.toFixed(4)}`],
    [
      "Zauth Market Penetration",
      `${(adjustedParams.zauthMarketPenetration * 100).toFixed(0)}%`,
    ],
    [
      "Staker Revenue Share",
      `${(adjustedParams.stakerRevenueShare * 100).toFixed(0)}%`,
    ]
  );

  console.log("\nAssumptions:");
  console.log(assumptionsTable.toString());

  const resultsTable = new Table({
    head: ["Metric", "Daily", "Annual"],
    style: { head: ["green"] },
  });

  resultsTable.push(
    [
      "USDC Wasted (no zauth)",
      formatCurrency(result.dailyWastedUsdc),
      formatCurrency(result.annualWastedUsdc),
    ],
    [
      "Zauth Queries",
      formatNumber(result.dailyZauthQueries),
      formatNumber(result.dailyZauthQueries * 365),
    ],
    [
      "Zauth Revenue",
      formatCurrency(result.dailyZauthRevenue),
      formatCurrency(result.annualZauthRevenue),
    ],
    [
      "Staker Revenue (70%)",
      formatCurrency(result.dailyStakerRevenue),
      formatCurrency(result.annualStakerRevenue),
    ],
    [
      "User Savings (net)",
      formatCurrency(result.dailyUserSavings),
      formatCurrency(result.annualUserSavings),
    ]
  );

  console.log("\nProjected Results:");
  console.log(resultsTable.toString());

  console.log("\n--- KEY INSIGHTS ---");
  console.log(
    `Net savings per query: $${result.netSavingsPerQuery.toFixed(4)} ` +
      `(${result.netSavingsPerQuery > 0 ? "PROFITABLE" : "NOT PROFITABLE"} to use zauth)`
  );

  if (result.netSavingsPerQuery > 0) {
    const breakEvenFailureRate =
      adjustedParams.zauthCheckCostUsdc / adjustedParams.avgPaymentUsdc;
    console.log(
      `Break-even failure rate: ${(breakEvenFailureRate * 100).toFixed(1)}% ` +
        `(zauth profitable if failure rate > this)`
    );
  }

  // Sensitivity analysis
  console.log("\n--- SENSITIVITY ANALYSIS ---");
  const penetrations = [0.05, 0.1, 0.2, 0.3];
  const sensitivityTable = new Table({
    head: [
      "Market Penetration",
      "Annual Zauth Revenue",
      "Annual Staker Revenue",
    ],
    style: { head: ["yellow"] },
  });

  for (const pen of penetrations) {
    const scenario = calculateOpportunitySizing({
      ...adjustedParams,
      zauthMarketPenetration: pen,
    });
    sensitivityTable.push([
      `${(pen * 100).toFixed(0)}%`,
      formatCurrency(scenario.annualZauthRevenue),
      formatCurrency(scenario.annualStakerRevenue),
    ]);
  }

  console.log(sensitivityTable.toString());
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

// Default parameters based on user's assumptions
export const DEFAULT_OPPORTUNITY_PARAMS: OpportunitySizingParams = {
  dailyX402Transactions: 20_000_000, // 20M by end-2026
  avgPaymentUsdc: 0.05, // $0.05 average
  endpointFailureRate: 0.3, // 30% failure rate
  zauthCheckCostUsdc: 0.005, // $0.005 per check
  zauthMarketPenetration: 0.1, // 10% adoption
  stakerRevenueShare: 0.7, // 70% to stakers
};
