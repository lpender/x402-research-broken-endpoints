/**
 * Real x402-enabled endpoint registry
 *
 * These endpoints accept x402 payments and return real DeFi data.
 * Prices are in USDC per request.
 */

import type { Network } from "./config.js";

export type EndpointCategory = "pool" | "whale" | "sentiment";

export interface RealEndpoint {
  url: string;
  name: string;
  category: EndpointCategory;
  priceUsdc: number;
  x402Enabled: boolean;
  network: Network;
}

/**
 * Registry of real x402-enabled endpoints
 *
 * Base (EVM) endpoints: Elsa x402 API
 * Solana endpoints: TBD - fewer x402 endpoints currently available
 */
export const REAL_ENDPOINTS: RealEndpoint[] = [
  // ============================================
  // BASE (EVM) ENDPOINTS - Elsa x402 API
  // ============================================

  // Pool/Yield data endpoints
  {
    url: "https://x402-api.heyelsa.ai/api/get_yield_suggestions",
    name: "Elsa Yield Suggestions",
    category: "pool",
    priceUsdc: 0.02,
    x402Enabled: true,
    network: "base",
  },
  {
    url: "https://x402-api.heyelsa.ai/api/analyze_wallet",
    name: "Elsa Wallet Analysis",
    category: "whale",
    priceUsdc: 0.01,
    x402Enabled: true,
    network: "base",
  },
  {
    url: "https://x402-api.heyelsa.ai/api/get_token_price",
    name: "Elsa Token Price",
    category: "sentiment",
    priceUsdc: 0.002,
    x402Enabled: true,
    network: "base",
  },

  // ============================================
  // SOLANA ENDPOINTS - Placeholder/TBD
  // ============================================

  // Pool data endpoints (placeholder - update when real endpoints available)
  {
    url: "https://api.defi-data.io/v1/pools",
    name: "DeFi Data Pool Analytics",
    category: "pool",
    priceUsdc: 0.01,
    x402Enabled: true,
    network: "solana",
  },

  // Whale tracking endpoints (placeholder)
  {
    url: "https://api.whale-tracker.io/v1/movements",
    name: "Whale Movement Tracker",
    category: "whale",
    priceUsdc: 0.02,
    x402Enabled: true,
    network: "solana",
  },

  // Sentiment endpoints (placeholder)
  {
    url: "https://api.crypto-sentiment.io/v1/analysis",
    name: "Crypto Sentiment Analysis",
    category: "sentiment",
    priceUsdc: 0.015,
    x402Enabled: true,
    network: "solana",
  },
];

/**
 * Get endpoints by category for a specific network
 */
export function getEndpointsByCategory(
  category: EndpointCategory,
  network: Network = "base"
): RealEndpoint[] {
  return REAL_ENDPOINTS.filter(
    (e) => e.category === category && e.x402Enabled && e.network === network
  );
}

/**
 * Get all x402-enabled endpoints for a specific network
 */
export function getEnabledEndpoints(network: Network = "base"): RealEndpoint[] {
  return REAL_ENDPOINTS.filter((e) => e.x402Enabled && e.network === network);
}

/**
 * Get endpoints for a specific network (alias for getEnabledEndpoints)
 */
export function getEndpointsForNetwork(network: Network): RealEndpoint[] {
  return getEnabledEndpoints(network);
}

/**
 * Get a single endpoint by category for a specific network (first available)
 */
export function getEndpointForCategory(
  category: EndpointCategory,
  network: Network = "base"
): RealEndpoint | undefined {
  return REAL_ENDPOINTS.find(
    (e) => e.category === category && e.x402Enabled && e.network === network
  );
}

/**
 * Estimate total cost for a study cycle (one request per category)
 */
export function estimateCycleCost(network: Network = "base"): number {
  const categories: EndpointCategory[] = ["pool", "whale", "sentiment"];
  return categories.reduce((sum, cat) => {
    const endpoint = getEndpointForCategory(cat, network);
    return sum + (endpoint?.priceUsdc ?? 0);
  }, 0);
}

/**
 * Convert RealEndpoint to Endpoint type (compatible with agent)
 */
export function toEndpoint(real: RealEndpoint): {
  url: string;
  name: string;
  category: string;
  priceUsdc: number;
} {
  return {
    url: real.url,
    name: real.name,
    category: real.category,
    priceUsdc: real.priceUsdc,
  };
}

/**
 * Get all real endpoints as Endpoint type for a specific network (for agent compatibility)
 */
export function getRealEndpointsAsEndpoints(
  network: Network = "base"
): Array<{
  url: string;
  name: string;
  category: string;
  priceUsdc: number;
}> {
  return getEnabledEndpoints(network).map(toEndpoint);
}
