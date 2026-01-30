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
  price: number; // USDC per request
  priceUsdc?: number; // Alias for backward compatibility
  x402Enabled?: boolean; // Optional for backward compatibility
  network?: Network; // Optional for Bazaar responses
  metadata?: any; // Optional Bazaar metadata
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
    price: 0.02,
    priceUsdc: 0.02,
    x402Enabled: true,
    network: "base",
  },
  {
    url: "https://x402-api.heyelsa.ai/api/analyze_wallet",
    name: "Elsa Wallet Analysis",
    category: "whale",
    price: 0.01,
    priceUsdc: 0.01,
    x402Enabled: true,
    network: "base",
  },
  {
    url: "https://x402-api.heyelsa.ai/api/get_token_price",
    name: "Elsa Token Price",
    category: "sentiment",
    price: 0.002,
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
    price: 0.01,
    priceUsdc: 0.01,
    x402Enabled: true,
    network: "solana",
  },

  // Whale tracking endpoints (placeholder)
  {
    url: "https://api.whale-tracker.io/v1/movements",
    name: "Whale Movement Tracker",
    category: "whale",
    price: 0.02,
    priceUsdc: 0.02,
    x402Enabled: true,
    network: "solana",
  },

  // Sentiment endpoints (placeholder)
  {
    url: "https://api.crypto-sentiment.io/v1/analysis",
    name: "Crypto Sentiment Analysis",
    category: "sentiment",
    price: 0.015,
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
    priceUsdc: real.priceUsdc ?? real.price,
  };
}

/**
 * Get all real endpoints as Endpoint type for a specific network (for agent compatibility)
 * Supports Bazaar discovery when enabled.
 */
export async function getRealEndpointsAsEndpoints(
  network: Network = "base",
  options?: {
    useBazaar?: boolean;
    bazaarClient?: any; // BazaarDiscoveryClient
  }
): Promise<Array<{
  url: string;
  name: string;
  category: string;
  priceUsdc: number;
}>> {
  // Try Bazaar discovery if enabled
  if (options?.useBazaar && options?.bazaarClient) {
    const bazaarEndpoints = await getBazaarEndpoints(options.bazaarClient, network);
    if (bazaarEndpoints.length > 0) {
      console.log(`[Bazaar] Using ${bazaarEndpoints.length} discovered endpoints`);
      return bazaarEndpoints.map(toEndpoint);
    }
    console.warn('[Bazaar] Discovery returned no endpoints, falling back to static registry');
  }

  // Fallback to static registry
  return getEnabledEndpoints(network).map(toEndpoint);
}

/**
 * Query Bazaar and transform to RealEndpoint array
 */
async function getBazaarEndpoints(bazaarClient: any, network: Network): Promise<RealEndpoint[]> {
  try {
    const { mapBazaarToRealEndpoints } = await import('./bazaar-mapper.js');

    // Query Bazaar API
    const response = await bazaarClient.discoverResources({
      type: 'http',
      limit: 100,
      network: network === 'base' ? 'eip155:8453' : undefined
    });

    // Transform to RealEndpoint format
    return mapBazaarToRealEndpoints(response.items, network);
  } catch (error) {
    console.warn(`[Bazaar] Failed to fetch endpoints: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
