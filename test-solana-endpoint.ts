#!/usr/bin/env node
/**
 * Test a single Solana x402 endpoint to see actual response format
 */

import { loadConfig } from "./src/config.js";
import { createRealX402Client } from "./src/x402-client.js";

async function testEndpoint() {
  console.log("Loading config...");
  const config = loadConfig();

  console.log("Creating x402 client for Solana...");
  const client = await createRealX402Client(config, "solana");

  const testUrl = "https://x402.silverbackdefi.app/api/v1/top-protocols";
  console.log(`\nTesting endpoint: ${testUrl}\n`);

  // Test with x402 payment
  console.log("Testing with x402 payment on Solana:");
  try {
    const endpoint = {
      url: testUrl,
      name: "Top Protocols Test",
      category: "pool" as const,
      priceUsdc: 0.001,
    };

    const result = await client.fetchEndpoint(endpoint);
    console.log(`   Success: ${result.success}`);
    console.log(`   Payment Made: ${result.paymentMade}`);
    console.log(`   Response Valid: ${result.responseValid}`);
    console.log(`   Latency: ${result.latencyMs}ms`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.response) {
      console.log(`\n   Full Response:`);
      console.log(JSON.stringify(result.response, null, 2));
    }
  } catch (error) {
    console.log(`   Error: ${error}`);
    if (error instanceof Error) {
      console.log(`   Stack: ${error.stack}`);
    }
  }
}

testEndpoint().catch(console.error);
