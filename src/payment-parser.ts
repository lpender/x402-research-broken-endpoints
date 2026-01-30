/**
 * Payment Header Parser
 *
 * Utilities for parsing and extracting pricing information from
 * 402 Payment Required response headers.
 */

import type { PaymentRequiredHeader, PaymentRequirement } from './types.js';

// Known USDC contract addresses (from bazaar-mapper.ts)
const USDC_ADDRESSES = {
  BASE_MAINNET: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  BASE_TESTNET: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  SOLANA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
};

/**
 * Parse Base64-encoded payment-required header from 402 response.
 *
 * @param base64 - Base64-encoded JSON string
 * @returns Parsed payment header or null if invalid
 */
export function parsePaymentRequiredHeader(base64: string): PaymentRequiredHeader | null {
  try {
    // Decode Base64
    const jsonString = Buffer.from(base64, 'base64').toString('utf-8');

    // Parse JSON
    const parsed = JSON.parse(jsonString);

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[PaymentParser] Invalid payment header: not an object');
      return null;
    }

    if (!Array.isArray(parsed.accepts)) {
      console.warn('[PaymentParser] Invalid payment header: missing accepts array');
      return null;
    }

    return parsed as PaymentRequiredHeader;
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`[PaymentParser] Failed to parse payment header: ${error.message}`);
    }
    return null;
  }
}

/**
 * Extract USDC price from a payment requirement.
 * Converts atomic units to human-readable USDC (divide by 1,000,000).
 *
 * @param requirement - Payment requirement from accepts array
 * @returns USDC amount or null if not USDC or invalid
 */
export function extractUsdcPrice(requirement: PaymentRequirement): number | null {
  // Check if asset is USDC
  const asset = requirement.asset?.toLowerCase();
  const isUsdc = asset === USDC_ADDRESSES.BASE_MAINNET.toLowerCase() ||
                 asset === USDC_ADDRESSES.BASE_TESTNET.toLowerCase() ||
                 asset === USDC_ADDRESSES.SOLANA;

  if (!isUsdc) {
    return null;
  }

  // Parse amount (atomic units)
  if (!requirement.amount) {
    return null;
  }

  try {
    // Convert from atomic units (6 decimals for USDC)
    const atomicAmount = BigInt(requirement.amount);
    const usdcAmount = Number(atomicAmount) / 1_000_000;
    return usdcAmount;
  } catch (error) {
    console.warn(`[PaymentParser] Failed to parse amount: ${requirement.amount}`);
    return null;
  }
}

/**
 * Find the primary USDC price from accepts array.
 * Returns the first USDC payment option found.
 *
 * @param accepts - Array of payment requirements
 * @returns USDC price or null if no USDC option found
 */
export function findPrimaryUsdcPrice(accepts: PaymentRequirement[]): number | null {
  for (const requirement of accepts) {
    const price = extractUsdcPrice(requirement);
    if (price !== null) {
      return price;
    }
  }
  return null;
}

/**
 * Summarize all payment options from accepts array.
 * Aggregates networks and price ranges.
 *
 * @param accepts - Array of payment requirements
 * @returns Summary of payment options
 */
export function summarizePaymentOptions(accepts: PaymentRequirement[]): {
  count: number;
  networks: string[];
  minPriceUsdc: number;
  maxPriceUsdc: number;
} {
  const networks = new Set<string>();
  const prices: number[] = [];

  for (const requirement of accepts) {
    // Collect networks
    if (requirement.network) {
      networks.add(requirement.network);
    }

    // Collect USDC prices
    const price = extractUsdcPrice(requirement);
    if (price !== null) {
      prices.push(price);
    }
  }

  return {
    count: accepts.length,
    networks: Array.from(networks),
    minPriceUsdc: prices.length > 0 ? Math.min(...prices) : 0,
    maxPriceUsdc: prices.length > 0 ? Math.max(...prices) : 0
  };
}

/**
 * Format price for display.
 *
 * @param usdc - USDC amount
 * @returns Formatted price string (e.g., "$0.05", "$0.0012")
 */
export function formatPrice(usdc: number): string {
  if (usdc >= 0.01) {
    return `$${usdc.toFixed(2)}`;
  } else if (usdc >= 0.001) {
    return `$${usdc.toFixed(3)}`;
  } else {
    return `$${usdc.toFixed(4)}`;
  }
}

/**
 * Format network identifier for display.
 * Converts "eip155:8453" → "Base", etc.
 *
 * @param network - Network identifier
 * @returns Human-readable network name
 */
export function formatNetwork(network: string): string {
  if (network === 'eip155:8453') return 'Base';
  if (network === 'eip155:84532') return 'Base Testnet';
  if (network === 'base') return 'Base';
  if (network === 'solana') return 'Solana';
  return network;
}
