import type { Endpoint } from "./config.js";

// Mock endpoints simulating real DeFi data providers with varying reliability
export const MOCK_ENDPOINTS: Endpoint[] = [
  {
    url: "https://mock-api.raydium.io/v1/pools",
    name: "Raydium Pools",
    category: "DeFi",
    priceUsdc: 0.03,
    mockFailureRate: 0.15, // 15% failure - relatively reliable
    mockLatencyMs: 200,
  },
  {
    url: "https://mock-api.orca.so/v1/whirlpools",
    name: "Orca Whirlpools",
    category: "DeFi",
    priceUsdc: 0.04,
    mockFailureRate: 0.20, // 20% failure
    mockLatencyMs: 250,
  },
  {
    url: "https://mock-api.kamino.finance/v1/vaults",
    name: "Kamino Vaults",
    category: "DeFi",
    priceUsdc: 0.05,
    mockFailureRate: 0.25, // 25% failure
    mockLatencyMs: 300,
  },
  {
    url: "https://mock-api.ainalyst.io/v1/whale-moves",
    name: "AInalyst Whale Tracking",
    category: "AI Analytics",
    priceUsdc: 0.05,
    mockFailureRate: 0.40, // 40% failure - flaky endpoint
    mockLatencyMs: 500,
  },
  {
    url: "https://mock-api.tokenmetrics.com/v1/sentiment",
    name: "Token Metrics Sentiment",
    category: "AI Analytics",
    priceUsdc: 0.04,
    mockFailureRate: 0.35, // 35% failure - somewhat flaky
    mockLatencyMs: 400,
  },
];

// Simulated response data for mock endpoints
export interface MockPoolData {
  poolId: string;
  tokenA: string;
  tokenB: string;
  tvl: number;
  apy: number;
  volume24h: number;
  feeRate: number;
  impermanentLossRisk: "low" | "medium" | "high";
}

export interface MockWhaleData {
  address: string;
  action: "buy" | "sell" | "transfer";
  token: string;
  amount: number;
  timestamp: number;
  significance: number; // 0-1 market impact score
}

export interface MockSentimentData {
  token: string;
  sentiment: "bullish" | "bearish" | "neutral";
  score: number; // -1 to 1
  confidence: number; // 0 to 1
  sources: string[]; // Data source names
}

export function generateMockPoolData(): MockPoolData[] {
  const pools = ["SOL-USDC", "RAY-SOL", "ORCA-USDC", "JTO-SOL", "BONK-SOL"];
  return pools.map((pool, i) => {
    const [tokenA, tokenB] = pool.split("-");
    const tvl = Math.random() * 99_000_000 + 1_000_000; // 1M-100M range
    const apy = Math.random() * 45 + 5; // 5-50% range

    // Assess impermanent loss risk
    const stablecoins = ["USDC", "USDT", "DAI"];
    let impermanentLossRisk: "low" | "medium" | "high";
    if (stablecoins.includes(tokenA) && stablecoins.includes(tokenB)) {
      impermanentLossRisk = "low";
    } else if (stablecoins.includes(tokenA) || stablecoins.includes(tokenB)) {
      impermanentLossRisk = "medium";
    } else {
      impermanentLossRisk = "high";
    }

    // Fee rate correlates with APY
    let feeRate: number;
    if (apy > 30) {
      feeRate = 0.01; // 1%
    } else if (apy > 15) {
      feeRate = 0.005; // 0.5%
    } else {
      feeRate = 0.003; // 0.3%
    }

    return {
      poolId: `pool_${i}_${Date.now()}`,
      tokenA,
      tokenB,
      tvl,
      apy,
      volume24h: Math.random() * 5_000_000 + 50_000,
      feeRate,
      impermanentLossRisk,
    };
  });
}

export function generateMockWhaleData(): MockWhaleData[] {
  const actions: Array<"buy" | "sell" | "transfer"> = ["buy", "sell", "transfer"];
  const tokens = ["SOL", "JTO", "BONK", "WIF", "PYTH"];
  return Array.from({ length: 5 }, (_, i) => {
    const amount = Math.random() * 1_000_000 + 10_000;
    // Calculate significance (0-1 based on amount)
    const maxWhaleAmount = 10_000_000;
    const significance = Math.min(amount / maxWhaleAmount, 1);

    return {
      address: `${Math.random().toString(36).substring(2, 8)}...${Math.random().toString(36).substring(2, 6)}`, // Truncated address format
      action: actions[Math.floor(Math.random() * 3)],
      token: tokens[i],
      amount,
      timestamp: Date.now() - Math.random() * 3_600_000,
      significance,
    };
  });
}

export function generateMockSentimentData(): MockSentimentData[] {
  const tokens = ["SOL", "JTO", "BONK", "WIF", "PYTH"];
  const sentiments: Array<"bullish" | "bearish" | "neutral"> = [
    "bullish",
    "bearish",
    "neutral",
  ];
  const sources = [
    ["Twitter", "Reddit", "Discord"],
    ["CoinGecko", "CoinMarketCap"],
    ["On-chain metrics", "Whale tracker"],
    ["News aggregator"],
    ["Social sentiment API", "Trading volume analysis"],
  ];

  return tokens.map((token, i) => ({
    token,
    sentiment: sentiments[Math.floor(Math.random() * 3)],
    score: Math.random() * 2 - 1, // -1 to 1
    confidence: Math.random() * 0.5 + 0.5, // 0.5 to 1
    sources: sources[i] || ["Unknown"],
  }));
}

export function generateMockResponse(endpoint: Endpoint): unknown {
  if (endpoint.url.includes("pools") || endpoint.url.includes("whirlpools")) {
    return { success: true, data: generateMockPoolData() };
  }
  if (endpoint.url.includes("vaults")) {
    return { success: true, data: generateMockPoolData() };
  }
  if (endpoint.url.includes("whale")) {
    return { success: true, data: generateMockWhaleData() };
  }
  if (endpoint.url.includes("sentiment")) {
    return { success: true, data: generateMockSentimentData() };
  }
  return { success: true, data: [] };
}

export function generateMockErrorResponse(): unknown {
  const errors = [
    { success: false, error: "Rate limit exceeded" },
    { success: false, error: "Internal server error" },
    { success: false, error: "Service temporarily unavailable" },
    { success: false, error: "Timeout" },
    { success: false, data: null }, // Empty response
    {}, // Malformed response
  ];
  return errors[Math.floor(Math.random() * errors.length)];
}

export function isValidResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  if (r.success === false) return false;
  if (!r.data) return false;
  if (Array.isArray(r.data) && r.data.length === 0) return false;
  return true;
}

export function selectRandomEndpoint(endpoints: Endpoint[]): Endpoint {
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}
