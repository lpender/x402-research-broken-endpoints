import type { Config, Endpoint, Network } from "./config.js";
import {
  generateMockResponse,
  generateMockErrorResponse,
  isValidResponse,
} from "./endpoints.js";

export interface PaymentResult {
  success: boolean;
  paymentMade: boolean;
  response: unknown;
  responseValid: boolean;
  latencyMs: number;
  error?: string;
}

// Mock x402 client for testing without real payments
class MockX402Client {
  private config: Config;
  private rng: { next: () => number } | null;
  private mockMode: boolean;

  constructor(config: Config, rng: { next: () => number } | null = null, mockMode: boolean = true) {
    this.config = config;
    this.rng = rng;
    this.mockMode = mockMode;
  }

  private random(): number {
    return this.rng ? this.rng.next() : Math.random();
  }

  async fetchWithPayment(endpoint: Endpoint): Promise<PaymentResult> {
    const startTime = Date.now();

    // Simulate network latency
    const latency = endpoint.mockLatencyMs || 200;
    await this.delay(latency + this.random() * 100);

    // Determine if this request "fails" based on mock failure rate
    const failureRate = endpoint.mockFailureRate ?? this.config.mockFailureRate;
    const shouldFail = this.random() < failureRate;

    // Payment always "succeeds" in mock mode (simulating the scenario where
    // you pay but get a bad response)
    const paymentMade = true;

    if (shouldFail) {
      const response = generateMockErrorResponse();
      return {
        success: false,
        paymentMade,
        response,
        responseValid: false,
        latencyMs: Date.now() - startTime,
        error: "Endpoint returned invalid response after payment",
      };
    }

    const response = generateMockResponse(endpoint);
    return {
      success: true,
      paymentMade,
      response,
      responseValid: isValidResponse(response),
      latencyMs: Date.now() - startTime,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Real x402 client using @x402/fetch
// This will be used in non-mock modes
class RealX402Client {
  private config: Config;
  private network: Network;
  private fetchWithPayment: typeof fetch | null = null;

  constructor(config: Config, network: Network = "base") {
    this.config = config;
    this.network = network;
  }

  async initialize(): Promise<void> {
    // Dynamic imports to avoid errors if packages aren't installed
    try {
      const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
      const client = new x402Client();

      if (this.network === "base") {
        // EVM/Base initialization
        const { registerExactEvmScheme } = await import("@x402/evm/exact/client");
        const { privateKeyToAccount } = await import("viem/accounts");

        const signer = privateKeyToAccount(this.config.evmPrivateKey as `0x${string}`);
        registerExactEvmScheme(client, { signer });
      } else {
        // Solana/SVM initialization
        const { registerExactSvmScheme } = await import("@x402/svm/exact/client");
        const { createKeyPairSignerFromBytes } = await import("@solana/kit");
        const { base58 } = await import("@scure/base");

        const svmSigner = await createKeyPairSignerFromBytes(
          base58.decode(this.config.solanaPrivateKey)
        );
        registerExactSvmScheme(client, { signer: svmSigner });
      }

      this.fetchWithPayment = wrapFetchWithPayment(fetch, client);
    } catch (error) {
      throw new Error(
        `Failed to initialize x402 client for ${this.network}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async fetchEndpoint(endpoint: Endpoint): Promise<PaymentResult> {
    if (!this.fetchWithPayment) {
      throw new Error("x402 client not initialized. Call initialize() first.");
    }

    const startTime = Date.now();

    try {
      const response = await this.fetchWithPayment(endpoint.url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          paymentMade: true, // Payment was made but response failed
          response: null,
          responseValid: false,
          latencyMs,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const responseValid = isValidResponse(data);

      return {
        success: responseValid,
        paymentMade: true,
        response: data,
        responseValid,
        latencyMs,
        error: responseValid ? undefined : "Response validation failed",
      };
    } catch (error) {
      return {
        success: false,
        paymentMade: true, // Assume payment was made even on network error
        response: null,
        responseValid: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Factory function to create appropriate client
export async function createX402Client(
  config: Config
): Promise<MockX402Client | RealX402Client> {
  if (config.mode === "mock") {
    return new MockX402Client(config);
  }

  const realClient = new RealX402Client(config);
  await realClient.initialize();
  return realClient;
}

// Factory function for study runner with seeded random
export function createMockX402Client(
  config: Config,
  rng: { next: () => number },
  mockMode: boolean = true
): MockX402Client {
  return new MockX402Client(config, rng, mockMode);
}

// Factory function for real x402 client
export async function createRealX402Client(
  config: Config,
  network: Network = "base"
): Promise<RealX402Client> {
  if (network === "base") {
    if (!config.evmPrivateKey) {
      throw new Error(
        "EVM_PRIVATE_KEY is required for real mode on Base. " +
        "Set it in your .env file or environment."
      );
    }
  } else {
    if (!config.solanaPrivateKey) {
      throw new Error(
        "SOLANA_PRIVATE_KEY is required for real mode on Solana. " +
        "Set it in your .env file or environment."
      );
    }
  }
  const client = new RealX402Client(config, network);
  await client.initialize();
  return client;
}

// Type for either client (for external use)
export type X402Client = MockX402Client | RealX402Client;

// Unified interface for both clients
export async function queryEndpoint(
  client: X402Client,
  endpoint: Endpoint,
  config: Config
): Promise<PaymentResult> {
  if (client instanceof MockX402Client) {
    return client.fetchWithPayment(endpoint);
  }
  return (client as RealX402Client).fetchEndpoint(endpoint);
}
