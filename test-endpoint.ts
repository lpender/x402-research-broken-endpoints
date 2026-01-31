#!/usr/bin/env node
/**
 * Test a single x402 endpoint to debug payment issues
 */

import { loadConfig } from "./src/config.js";
import { createRealX402Client } from "./src/x402-client.js";

async function testEndpoint() {
  console.log("Loading config...");
  const config = loadConfig();

  console.log("Creating x402 client...");
  const client = await createRealX402Client(config, "base");

  const testUrl = "https://x402.silverbackdefi.app/api/v1/defi-yield";
  console.log(`\nTesting endpoint: ${testUrl}\n`);

  // First, try a regular fetch to see the 402 response
  console.log("1. Testing without payment (should get 402):");
  try {
    const regularResponse = await fetch(testUrl);
    console.log(`   Status: ${regularResponse.status} ${regularResponse.statusText}`);
    const headers = regularResponse.headers.get("payment-required");
    if (headers) {
      console.log(`   Payment-Required header present: ${headers.substring(0, 100)}...`);
    }
  } catch (error) {
    console.log(`   Error: ${error}`);
  }

  // Now try with x402 payment
  console.log("\n2. Testing with x402 payment:");
  try {
    const endpoint = {
      url: testUrl,
      name: "DeFi Yield Test",
      category: "pool" as const,
      priceUsdc: 0.002,
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
      console.log(`   Response: ${JSON.stringify(result.response, null, 2).substring(0, 500)}`);
    }
  } catch (error) {
    console.log(`   Error: ${error}`);
  }

  // Try direct use of wrapFetchWithPayment to see what's happening
  console.log("\n3. Testing with direct x402 fetch wrapper:");
  try {
    const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");
    const { privateKeyToAccount } = await import("viem/accounts");

    const client = new x402Client();
    const signer = privateKeyToAccount(config.evmPrivateKey as `0x${string}`);
    registerExactEvmScheme(client, { signer });

    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    console.log(`   Fetching ${testUrl}...`);
    const response = await fetchWithPayment(testUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log(`   Data: ${JSON.stringify(data, null, 2).substring(0, 500)}`);
    } else {
      const text = await response.text();
      console.log(`   Response text: ${text.substring(0, 500)}`);
    }
  } catch (error) {
    console.log(`   Error: ${error}`);
    if (error instanceof Error) {
      console.log(`   Stack: ${error.stack}`);
    }
  }
}

testEndpoint().catch(console.error);
