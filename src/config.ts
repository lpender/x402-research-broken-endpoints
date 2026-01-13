import { config as loadEnv } from "dotenv";

loadEnv();

export type ExperimentMode = "mock" | "no-zauth" | "with-zauth";

export interface Config {
  // Solana
  solanaPrivateKey: string;
  solanaRpcUrl: string;

  // Experiment
  mode: ExperimentMode;
  iterations: number;
  delayMs: number;
  maxUsdcSpend: number;
  mockFailureRate: number;

  // Zauth
  zauthDirectoryUrl: string;
  zauthCheckUrl: string;

  // Output
  outputDir: string;
  verbose: boolean;
}

export interface Endpoint {
  url: string;
  name: string;
  category: string;
  priceUsdc: number;
  // For mock endpoints
  mockFailureRate?: number;
  mockLatencyMs?: number;
}

export interface IterationResult {
  iteration: number;
  timestamp: Date;
  endpoint: string;
  mode: ExperimentMode;
  zauthChecked: boolean;
  zauthScore: number | null;
  zauthSkipped: boolean;
  skipReason: string | null;
  paymentAttempted: boolean;
  paymentSucceeded: boolean;
  responseValid: boolean;
  burnUsdc: number;
  spentUsdc: number;
  latencyMs: number;
  errorMessage: string | null;
}

export interface ExperimentSummary {
  mode: ExperimentMode;
  totalIterations: number;
  totalSpentUsdc: number;
  totalBurnUsdc: number;
  burnRate: number;
  successes: number;
  failures: number;
  skips: number;
  avgLatencyMs: number;
  savedUsdc: number;
}

export interface ZauthHealthCheckResponse {
  working: boolean;
  uptime: number;
  cached: boolean;
  stale: boolean;
  responseTime: number;
}

export interface ZauthDirectoryEntry {
  url: string;
  name: string;
  category: string;
  uptime: number;
  pricePerCall: number;
  verified: boolean;
  tags: string[];
}

function parseMode(value: string | undefined): ExperimentMode {
  if (value === "mock" || value === "no-zauth" || value === "with-zauth") {
    return value;
  }
  return "mock";
}

function parseArgs(): Partial<Config> {
  const args: Partial<Config> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--mode" && next) {
      args.mode = parseMode(next);
      i++;
    } else if (arg === "--iterations" && next) {
      args.iterations = parseInt(next, 10);
      i++;
    } else if (arg === "--delay" && next) {
      args.delayMs = parseInt(next, 10);
      i++;
    } else if (arg === "--max-spend" && next) {
      args.maxUsdcSpend = parseFloat(next);
      i++;
    } else if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
    }
  }

  return args;
}

export function loadConfig(): Config {
  const envConfig: Config = {
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || "",
    solanaRpcUrl:
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    mode: parseMode(process.env.MODE),
    iterations: parseInt(process.env.ITERATIONS || "100", 10),
    delayMs: parseInt(process.env.DELAY_MS || "5000", 10),
    maxUsdcSpend: parseFloat(process.env.MAX_USDC_SPEND || "1.00"),
    mockFailureRate: parseFloat(process.env.MOCK_FAILURE_RATE || "0.30"),
    zauthDirectoryUrl:
      process.env.ZAUTH_DIRECTORY_URL ||
      "https://back.zauthx402.com/api/verification/directory",
    zauthCheckUrl:
      process.env.ZAUTH_CHECK_URL ||
      "https://back.zauthx402.com/api/verification/check",
    outputDir: process.env.OUTPUT_DIR || "./results",
    verbose: process.env.VERBOSE === "true",
  };

  // CLI args override env vars
  const cliArgs = parseArgs();

  return {
    ...envConfig,
    ...cliArgs,
  } as Config;
}

export function validateConfig(config: Config): void {
  if (config.mode !== "mock" && !config.solanaPrivateKey) {
    throw new Error(
      "SOLANA_PRIVATE_KEY is required for non-mock modes. Set it in .env or use --mode mock"
    );
  }

  if (config.iterations < 1 || config.iterations > 500) {
    throw new Error("Iterations must be between 1 and 500");
  }

  if (config.delayMs < 1000) {
    throw new Error("Delay must be at least 1000ms to avoid rate limits");
  }

  if (config.maxUsdcSpend <= 0) {
    throw new Error("Max USDC spend must be positive");
  }

  if (config.mockFailureRate < 0 || config.mockFailureRate > 1) {
    throw new Error("Mock failure rate must be between 0 and 1");
  }
}
