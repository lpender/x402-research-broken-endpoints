#!/usr/bin/env node
/**
 * Inspect actual response structures from successful Solana endpoints
 */

import { loadConfig } from "./src/config.js";
import { createRealX402Client } from "./src/x402-client.js";

async function inspectEndpoints() {
  console.log("Loading config...");
  const config = loadConfig();

  console.log("Creating x402 client for Solana...");
  const client = await createRealX402Client(config, "solana");

  const endpoints = [
    {
      name: "Top Protocols",
      url: "https://x402.silverbackdefi.app/api/v1/top-protocols",
      price: 0.001
    },
    {
      name: "Top Pools",
      url: "https://x402.silverbackdefi.app/api/v1/top-pools",
      price: 0.001
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`ENDPOINT: ${endpoint.name}`);
    console.log(`URL: ${endpoint.url}`);
    console.log(`${"=".repeat(80)}\n`);

    try {
      const result = await client.fetchEndpoint({
        url: endpoint.url,
        name: endpoint.name,
        category: "pool" as const,
        priceUsdc: endpoint.price,
      });

      console.log(`Success: ${result.success}`);
      console.log(`Latency: ${result.latencyMs}ms`);

      if (result.response) {
        console.log(`\nResponse Structure:`);
        console.log(`  Type: ${typeof result.response}`);

        if (typeof result.response === 'object') {
          console.log(`  Top-level keys: ${Object.keys(result.response).join(', ')}`);

          // Show nested structure
          const resp = result.response as any;
          if (resp.data && typeof resp.data === 'object') {
            console.log(`  data type: ${Array.isArray(resp.data) ? 'array' : 'object'}`);
            if (!Array.isArray(resp.data)) {
              console.log(`  data keys: ${Object.keys(resp.data).join(', ')}`);

              // Show first item structure
              for (const key of Object.keys(resp.data)) {
                if (Array.isArray(resp.data[key]) && resp.data[key].length > 0) {
                  console.log(`\n  ${key}[0] structure:`);
                  console.log(`    Keys: ${Object.keys(resp.data[key][0]).join(', ')}`);
                  console.log(`    Sample: ${JSON.stringify(resp.data[key][0], null, 2).split('\n').slice(0, 10).join('\n')}`);
                }
              }
            }
          }
        }

        console.log(`\nFull Response (first 500 chars):`);
        console.log(JSON.stringify(result.response, null, 2).substring(0, 500));
      }
    } catch (error) {
      console.log(`Error: ${error}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

inspectEndpoints().catch(console.error);
