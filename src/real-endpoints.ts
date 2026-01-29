/**
 * Real x402-enabled endpoint registry
 *
 * These endpoints accept x402 payments and return real DeFi data.
 * Prices are in USDC per request.
 */

export type EndpointCategory = "pool" | "whale" | "sentiment";

export interface RealEndpoint {
  url: string;
  name: string;
  category: EndpointCategory;
  priceUsdc: number;
  x402Enabled: boolean;
}

/**
 * Registry of real x402-enabled endpoints
 *
 * Note: These are placeholder URLs representing the expected endpoint structure.
 * Replace with actual x402-enabled endpoints when available.
 */
export const REAL_ENDPOINTS: RealEndpoint[] = [
  // Pool data endpoints
  {
    url: "https://api.defi-data.io/v1/pools",
    name: "DeFi Data Pool Analytics",
    category: "pool",
    priceUsdc: 0.01,
    x402Enabled: true,
  },
  {
    url: "https://api.solana-analytics.com/v1/liquidity-pools",
    name: "Solana Pool Metrics",
    category: "pool",
    priceUsdc: 0.015,
    x402Enabled: true,
  },

  // Whale tracking endpoints
  {
    url: "https://api.whale-tracker.io/v1/movements",
    name: "Whale Movement Tracker",
    category: "whale",
    priceUsdc: 0.02,
    x402Enabled: true,
  },
  {
    url: "https://api.onchain-intel.com/v1/large-transactions",
    name: "On-Chain Intelligence",
    category: "whale",
    priceUsdc: 0.025,
    x402Enabled: true,
  },

  // Sentiment endpoints
  {
    url: "https://api.crypto-sentiment.io/v1/analysis",
    name: "Crypto Sentiment Analysis",
    category: "sentiment",
    priceUsdc: 0.015,
    x402Enabled: true,
  },
  {
    url: "https://api.social-metrics.io/v1/token-sentiment",
    name: "Social Metrics Sentiment",
    category: "sentiment",
    priceUsdc: 0.02,
    x402Enabled: true,
  },
];

/**
 * Get endpoints by category
 */
export function getEndpointsByCategory(
  category: EndpointCategory
): RealEndpoint[] {
  return REAL_ENDPOINTS.filter((e) => e.category === category && e.x402Enabled);
}

/**
 * Get all x402-enabled endpoints
 */
export function getEnabledEndpoints(): RealEndpoint[] {
  return REAL_ENDPOINTS.filter((e) => e.x402Enabled);
}

/**
 * Get a single endpoint by category (first available)
 */
export function getEndpointForCategory(
  category: EndpointCategory
): RealEndpoint | undefined {
  return REAL_ENDPOINTS.find((e) => e.category === category && e.x402Enabled);
}

/**
 * Estimate total cost for a study cycle (one request per category)
 */
export function estimateCycleCost(): number {
  const categories: EndpointCategory[] = ["pool", "whale", "sentiment"];
  return categories.reduce((sum, cat) => {
    const endpoint = getEndpointForCategory(cat);
    return sum + (endpoint?.priceUsdc ?? 0);
  }, 0);
}
