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
  action: "buy" | "sell";
  token: string;
  amount: number;
  timestamp: number;
}

export interface MockSentimentData {
  token: string;
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  confidence: number;
}

export function generateMockPoolData(): MockPoolData[] {
  const pools = ["SOL-USDC", "RAY-SOL", "ORCA-USDC", "JTO-SOL", "BONK-SOL"];
  return pools.map((pool, i) => {
    const [tokenA, tokenB] = pool.split("-");
    return {
      poolId: `pool_${i}_${Date.now()}`,
      tokenA,
      tokenB,
      tvl: Math.random() * 10000000 + 100000,
      apy: Math.random() * 50 + 5,
      volume24h: Math.random() * 5000000 + 50000,
    };
  });
}

export function generateMockWhaleData(): MockWhaleData[] {
  const actions: Array<"buy" | "sell"> = ["buy", "sell"];
  const tokens = ["SOL", "JTO", "BONK", "WIF", "PYTH"];
  return Array.from({ length: 5 }, (_, i) => ({
    address: `whale_${Math.random().toString(36).substring(7)}`,
    action: actions[Math.floor(Math.random() * 2)],
    token: tokens[i],
    amount: Math.random() * 1000000 + 10000,
    timestamp: Date.now() - Math.random() * 3600000,
  }));
}

export function generateMockSentimentData(): MockSentimentData[] {
  const tokens = ["SOL", "JTO", "BONK", "WIF", "PYTH"];
  const sentiments: Array<"bullish" | "bearish" | "neutral"> = [
    "bullish",
    "bearish",
    "neutral",
  ];
  return tokens.map((token) => ({
    token,
    sentiment: sentiments[Math.floor(Math.random() * 3)],
    score: Math.random() * 2 - 1, // -1 to 1
    confidence: Math.random() * 0.5 + 0.5, // 0.5 to 1
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
