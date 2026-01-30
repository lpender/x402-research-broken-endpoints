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
  network: 'base' | 'solana',
  verbose?: boolean
): RealEndpoint[] {
  const endpoints: RealEndpoint[] = [];

  if (verbose) {
    console.log(`\n[Bazaar Debug] Mapping ${resources.length} resources for network: ${network}\n`);
  }

  for (const resource of resources) {
    // Skip resources without accepts array
    if (!resource.accepts || resource.accepts.length === 0) {
      continue;
    }

    // Filter by network
    if (!matchesNetwork(resource, network, verbose)) {
      continue;
    }

    // Classify category
    const category = classifyCategory(resource, verbose);
    if (!category) {
      if (!verbose) {
        const url = resource.accepts[0]?.resource || '(unknown)';
        console.log(`[Bazaar] Skipping unclassified endpoint: ${url}`);
      }
      continue;
    }

    // Extract URL and pricing from first accepts entry
    const firstAccept = resource.accepts[0];
    const url = firstAccept.resource;
    const price = extractPriceUsdc(resource.accepts);

    // Build endpoint
    const endpoint = {
      url,
      name: extractName(firstAccept),
      category,
      price,
      metadata: { description: firstAccept.description }
    };
    endpoints.push(endpoint);

    if (verbose) {
      console.log(`[Bazaar Debug] ✓ Mapped endpoint: ${endpoint.url}`);
      console.log(`  Category: ${endpoint.category}, Price: $${endpoint.price.toFixed(4)}, Name: ${endpoint.name}\n`);
    }
  }

  if (verbose) {
    console.log(`[Bazaar Debug] Mapping complete:`);
    console.log(`  Total input: ${resources.length}`);
    console.log(`  Successfully mapped: ${endpoints.length}`);
    console.log(`  Filtered out: ${resources.length - endpoints.length}`);

    // Show categories found
    const categories = [...new Set(endpoints.map(e => e.category))];
    if (categories.length > 0) {
      console.log(`  Categories found: ${categories.join(', ')}`);
    }
    console.log('');
  } else {
    console.log(`[Bazaar] Mapped ${endpoints.length}/${resources.length} endpoints for ${network}`);
  }

  return endpoints;
}

/**
 * Classify endpoint category based on keywords
 */
function classifyCategory(resource: BazaarResource, verbose?: boolean): 'pool' | 'whale' | 'sentiment' | null {
  // Extract URL and description from first accepts entry
  const firstAccept = resource.accepts?.[0];
  if (!firstAccept) {
    if (verbose) {
      console.log(`[Bazaar Debug] Category classification failed: No accepts array\n`);
    }
    return null;
  }

  const url = firstAccept.resource || '';
  const description = firstAccept.description || '';

  const text = [url, description].join(' ').toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category as 'pool' | 'whale' | 'sentiment';
    }
  }

  // Classification failed - log details if verbose
  if (verbose) {
    console.log(`[Bazaar Debug] Category classification failed for: ${url}`);
    console.log(`  Description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
    console.log(`  Combined text checked: "${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"\n`);
  }

  return null; // Unclassified endpoints are filtered out
}

/**
 * Check if resource matches the target network
 */
function matchesNetwork(resource: BazaarResource, network: 'base' | 'solana', verbose?: boolean): boolean {
  const accepts = resource.accepts || [];

  for (const requirement of accepts) {
    if (network === 'base') {
      // Check for Base network string or EIP-155 chain IDs
      if (requirement.network === 'base' ||
          requirement.network === 'eip155:8453' ||
          requirement.network === 'eip155:84532') {
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

  // Network filter rejected - log details if verbose
  if (verbose) {
    const url = resource.accepts?.[0]?.resource || '(unknown)';
    console.log(`[Bazaar Debug] Network filter rejected: ${url}`);
    console.log(`  Required network: ${network}`);
    console.log(`  Payment requirements:`);
    if (accepts.length === 0) {
      console.log(`    (none)`);
    } else {
      accepts.forEach((req, idx) => {
        console.log(`    [${idx}] resource: ${req.resource}, scheme: ${req.scheme}, network: ${req.network || '(none)'}, asset: ${req.asset || '(none)'}`);
      });
    }
    console.log('');
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
function extractName(accept: BazaarPaymentRequirement): string {
  // Derive from URL
  try {
    const url = new URL(accept.resource);
    const path = url.pathname.split('/').filter(p => p).pop() || 'endpoint';
    return path.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown Endpoint';
  }
}
