import type {
  Config,
  Endpoint,
  Network,
  ZauthHealthCheckResponse,
  ZauthDirectoryEntry,
} from "./config.js";

export interface ZauthCheckResult {
  checked: boolean;
  reliable: boolean;
  score: number; // 0-100, based on uptime
  shouldSkip: boolean;
  skipReason: string | null;
  response: ZauthHealthCheckResponse | null;
  latencyMs: number;
  error?: string;
}

// Threshold for considering an endpoint reliable
const RELIABILITY_THRESHOLD = 0.70; // 70% uptime minimum

// Mock Zauth client for testing
class MockZauthClient {
  private config: Config;
  private rng: { next: () => number } | null;

  constructor(config: Config, rng: { next: () => number } | null = null) {
    this.config = config;
    this.rng = rng;
  }

  private random(): number {
    return this.rng ? this.rng.next() : Math.random();
  }

  async checkEndpoint(endpoint: Endpoint): Promise<ZauthCheckResult> {
    const startTime = Date.now();

    // Simulate network latency
    await this.delay(50 + this.random() * 50);

    // In mock mode, zauth "knows" the mock failure rates and reports accordingly
    const failureRate = endpoint.mockFailureRate ?? this.config.mockFailureRate;
    const uptime = 1 - failureRate;
    const working = this.random() > failureRate * 0.5; // Current check has better odds

    const response: ZauthHealthCheckResponse = {
      working,
      uptime: uptime * 100,
      cached: this.random() > 0.7,
      stale: this.random() > 0.9,
      responseTime: (endpoint.mockLatencyMs || 200) + this.random() * 100,
    };

    const score = uptime * 100;
    const reliable = uptime >= RELIABILITY_THRESHOLD;
    const shouldSkip = !reliable || !working;

    let skipReason: string | null = null;
    if (!working) {
      skipReason = "Endpoint currently not working";
    } else if (!reliable) {
      skipReason = `Low uptime: ${(uptime * 100).toFixed(1)}% < ${RELIABILITY_THRESHOLD * 100}%`;
    }

    return {
      checked: true,
      reliable,
      score,
      shouldSkip,
      skipReason,
      response,
      latencyMs: Date.now() - startTime,
    };
  }

  async getDirectory(): Promise<ZauthDirectoryEntry[]> {
    // Return mock directory entries based on our mock endpoints
    await this.delay(100);
    return [
      {
        url: "https://mock-api.raydium.io/v1/pools",
        name: "Raydium Pools",
        category: "DeFi",
        uptime: 85,
        pricePerCall: 0.03,
        verified: true,
        tags: ["defi", "liquidity", "solana"],
      },
      {
        url: "https://mock-api.orca.so/v1/whirlpools",
        name: "Orca Whirlpools",
        category: "DeFi",
        uptime: 80,
        pricePerCall: 0.04,
        verified: true,
        tags: ["defi", "liquidity", "solana"],
      },
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Real Zauth client using the live API
class RealZauthClient {
  private config: Config;
  private network: Network;
  private x402Fetch: typeof fetch | null = null;

  constructor(config: Config, network: Network = "base") {
    this.config = config;
    this.network = network;
  }

  async initialize(): Promise<void> {
    // Initialize x402 fetch for paid health checks
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

      this.x402Fetch = wrapFetchWithPayment(fetch, client);
    } catch (error) {
      console.warn(
        `Failed to initialize x402 for zauth on ${this.network}. Health checks will be skipped:`,
        error
      );
    }
  }

  async checkEndpoint(endpoint: Endpoint): Promise<ZauthCheckResult> {
    const startTime = Date.now();

    if (!this.x402Fetch) {
      return {
        checked: false,
        reliable: true, // Assume reliable if we can't check
        score: 100,
        shouldSkip: false,
        skipReason: null,
        response: null,
        latencyMs: Date.now() - startTime,
        error: "Zauth client not initialized",
      };
    }

    try {
      const response = await this.x402Fetch(this.config.zauthCheckUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url: endpoint.url }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          checked: false,
          reliable: true, // Fail open - assume reliable if check fails
          score: 100,
          shouldSkip: false,
          skipReason: null,
          response: null,
          latencyMs,
          error: `Zauth API error: ${response.status}`,
        };
      }

      const data = (await response.json()) as ZauthHealthCheckResponse;
      const score = data.uptime;
      const reliable = data.uptime >= RELIABILITY_THRESHOLD * 100;
      const shouldSkip = !reliable || !data.working;

      let skipReason: string | null = null;
      if (!data.working) {
        skipReason = "Endpoint currently not working";
      } else if (!reliable) {
        skipReason = `Low uptime: ${data.uptime.toFixed(1)}% < ${RELIABILITY_THRESHOLD * 100}%`;
      }

      return {
        checked: true,
        reliable,
        score,
        shouldSkip,
        skipReason,
        response: data,
        latencyMs,
      };
    } catch (error) {
      return {
        checked: false,
        reliable: true, // Fail open
        score: 100,
        shouldSkip: false,
        skipReason: null,
        response: null,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getDirectory(
    options: {
      category?: string;
      search?: string;
      activeOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<ZauthDirectoryEntry[]> {
    try {
      const params = new URLSearchParams();
      if (options.category) params.set("category", options.category);
      if (options.search) params.set("search", options.search);
      if (options.activeOnly !== undefined)
        params.set("activeOnly", String(options.activeOnly));
      if (options.limit) params.set("limit", String(options.limit));

      const url = `${this.config.zauthDirectoryUrl}?${params}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        console.warn(`Zauth directory error: ${response.status}`);
        return [];
      }

      return (await response.json()) as ZauthDirectoryEntry[];
    } catch (error) {
      console.warn("Failed to fetch zauth directory:", error);
      return [];
    }
  }
}

// Factory function
export async function createZauthClient(
  config: Config,
  network: Network = "base"
): Promise<MockZauthClient | RealZauthClient> {
  if (config.mode === "mock") {
    return new MockZauthClient(config);
  }

  const realClient = new RealZauthClient(config, network);
  await realClient.initialize();
  return realClient;
}

// Unified check function
export async function checkEndpointReliability(
  client: MockZauthClient | RealZauthClient,
  endpoint: Endpoint
): Promise<ZauthCheckResult> {
  return client.checkEndpoint(endpoint);
}

// Factory function for study runner with seeded random
export function createMockZauthClient(
  config: Config,
  rng: { next: () => number }
): MockZauthClient {
  return new MockZauthClient(config, rng);
}
