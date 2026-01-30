/**
 * Bazaar Response Mapper
 *
 * Transforms Bazaar API responses to RealEndpoint format with:
 * - Category classification via keyword matching
 * - Network filtering (Base/Solana via EIP-155 and asset addresses)
 * - USDC price extraction from payment requirements
 */

import { BazaarResource, BazaarPaymentRequirement } from './bazaar-client.js';
import type { RealEndpoint } from './real-endpoints.js';

// Known USDC contract addresses
const USDC_ADDRESSES = {
  BASE_MAINNET: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  BASE_TESTNET: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // Base Sepolia
  SOLANA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
};

// Category classification keywords
const CATEGORY_KEYWORDS = {
  pool: ['pool', 'yield', 'liquidity', 'vault', 'tvl', 'apy', 'lending', 'borrow'],
  whale: ['whale', 'movement', 'wallet', 'tracker', 'flow', 'holder', 'transfer'],
  sentiment: ['sentiment', 'analysis', 'price', 'signal', 'market', 'trend', 'indicator']
};

/**
 * Transform Bazaar resources to RealEndpoint array
 */
export function mapBazaarToRealEndpoints(
  resources: BazaarResource[],
  network: 'base' | 'solana'
): RealEndpoint[] {
  const endpoints: RealEndpoint[] = [];

  for (const resource of resources) {
    // Filter by network
    if (!matchesNetwork(resource, network)) {
      continue;
    }

    // Classify category
    const category = classifyCategory(resource);
    if (!category) {
      console.log(`[Bazaar] Skipping unclassified endpoint: ${resource.url}`);
      continue;
    }

    // Extract pricing
    const price = extractPriceUsdc(resource.accepts || []);

    // Build endpoint
    endpoints.push({
      url: resource.url,
      name: extractName(resource),
      category,
      price,
      metadata: resource.metadata
    });
  }

  console.log(`[Bazaar] Mapped ${endpoints.length}/${resources.length} endpoints for ${network}`);
  return endpoints;
}

/**
 * Classify endpoint category based on keywords
 */
function classifyCategory(resource: BazaarResource): 'pool' | 'whale' | 'sentiment' | null {
  const text = [
    resource.url,
    resource.metadata?.name || '',
    resource.metadata?.description || '',
    resource.metadata?.category || ''
  ].join(' ').toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category as 'pool' | 'whale' | 'sentiment';
    }
  }

  return null; // Unclassified endpoints are filtered out
}

/**
 * Check if resource matches the target network
 */
function matchesNetwork(resource: BazaarResource, network: 'base' | 'solana'): boolean {
  const accepts = resource.accepts || [];

  for (const requirement of accepts) {
    if (network === 'base') {
      // Check for Base chain IDs (EIP-155 format)
      if (requirement.network === 'eip155:8453' || requirement.network === 'eip155:84532') {
        return true;
      }
      // Check for Base USDC contract address
      if (requirement.asset?.toLowerCase() === USDC_ADDRESSES.BASE_MAINNET ||
          requirement.asset?.toLowerCase() === USDC_ADDRESSES.BASE_TESTNET) {
        return true;
      }
    } else if (network === 'solana') {
      // Check for Solana USDC address
      if (requirement.asset === USDC_ADDRESSES.SOLANA) {
        return true;
      }
      // Check for base58 format (Solana addresses)
      if (requirement.asset && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(requirement.asset)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract USDC price from payment requirements
 */
function extractPriceUsdc(accepts: BazaarPaymentRequirement[]): number {
  for (const requirement of accepts) {
    // Look for exact payment scheme with USDC
    if (requirement.scheme !== 'exact') continue;

    const asset = requirement.asset?.toLowerCase();
    const isUsdc = asset === USDC_ADDRESSES.BASE_MAINNET ||
                   asset === USDC_ADDRESSES.BASE_TESTNET ||
                   asset === USDC_ADDRESSES.SOLANA;

    if (isUsdc && requirement.amount) {
      try {
        // Convert from atomic units (6 decimals for USDC)
        const atomicAmount = BigInt(requirement.amount);
        const usdcAmount = Number(atomicAmount) / 1_000_000;
        return usdcAmount;
      } catch (error) {
        console.warn(`[Bazaar] Failed to parse amount: ${requirement.amount}`);
      }
    }
  }

  // Default price if no USDC payment found
  return 0.01;
}

/**
 * Extract endpoint display name
 */
function extractName(resource: BazaarResource): string {
  if (resource.metadata?.name) {
    return resource.metadata.name;
  }

  // Fallback: derive from URL
  try {
    const url = new URL(resource.url);
    const path = url.pathname.split('/').filter(p => p).pop() || 'endpoint';
    return path.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown Endpoint';
  }
}
