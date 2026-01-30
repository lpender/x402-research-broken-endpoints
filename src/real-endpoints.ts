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
 * Error thrown when Bazaar endpoint discovery fails
 */
export class BazaarDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly diagnostics?: {
      network: Network;
      itemsReturned: number;
      verbose: boolean;
    }
  ) {
    super(message);
    this.name = 'BazaarDiscoveryError';
  }
}

/**
 * Estimate total cost for a study cycle (one request per category)
 * Calculates based on provided endpoints array.
 */
export function estimateCycleCost(network: Network = "base", endpoints?: RealEndpoint[]): number {
  // If no endpoints provided, return rough estimate
  if (!endpoints || endpoints.length === 0) {
    // Rough estimate: $0.01 per request, 3 categories
    return 0.03;
  }

  const categories: EndpointCategory[] = ["pool", "whale", "sentiment"];
  return categories.reduce((sum, cat) => {
    const endpoint = endpoints.find(e => e.category === cat);
    return sum + (endpoint?.priceUsdc ?? endpoint?.price ?? 0.01);
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
 * Uses Bazaar discovery exclusively - no fallback to static registry.
 * Throws BazaarDiscoveryError if no endpoints are discovered.
 */
export async function getRealEndpointsAsEndpoints(
  network: Network,
  bazaarClient: any, // BazaarDiscoveryClient (required)
  config?: { verbose?: boolean }
): Promise<Array<{
  url: string;
  name: string;
  category: string;
  priceUsdc: number;
}>> {
  const verbose = config?.verbose || false;

  // Query Bazaar for endpoints
  const bazaarEndpoints = await getBazaarEndpoints(bazaarClient, network, verbose);

  // Validate we got endpoints
  if (bazaarEndpoints.length === 0) {
    throw new BazaarDiscoveryError(
      `Bazaar discovery returned no endpoints for network: ${network}`,
      {
        network,
        itemsReturned: 0,
        verbose
      }
    );
  }

  console.log(`[Bazaar] Using ${bazaarEndpoints.length} discovered endpoints`);
  return bazaarEndpoints.map(toEndpoint);
}

/**
 * Query Bazaar and transform to RealEndpoint array
 * Errors propagate to caller for proper error context
 */
async function getBazaarEndpoints(bazaarClient: any, network: Network, verbose?: boolean): Promise<RealEndpoint[]> {
  const { mapBazaarToRealEndpoints } = await import('./bazaar-mapper.js');

  // Query Bazaar API (errors propagate)
  const response = await bazaarClient.discoverResources({
    type: 'http',
    limit: 100,
    network: network === 'base' ? 'eip155:8453' : undefined,
    verbose
  });

  // Transform to RealEndpoint format
  return mapBazaarToRealEndpoints(response.items, network, verbose);
}
