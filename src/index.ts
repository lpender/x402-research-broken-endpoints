#!/usr/bin/env node

import {
  loadConfig,
  validateConfig,
  validateRealModeConfig,
  type Config,
  type IterationResult,
  type ExperimentMode,
  type Network,
} from "./config.js";
import { MOCK_ENDPOINTS, selectRandomEndpoint } from "./endpoints.js";
import { createX402Client, queryEndpoint } from "./x402-client.js";
import { createZauthClient, checkEndpointReliability } from "./zauth-client.js";
import { MetricsCollector } from "./metrics.js";
import {
  printOpportunitySizing,
  DEFAULT_OPPORTUNITY_PARAMS,
} from "./opportunity.js";
import { runScientificStudy } from "./study.js";
import { printFullReport, exportRawDataCsv, exportSummaryJson, generateMarkdownReport } from "./report.js";
import { YieldOptimizerAgent } from "./yield-agent.js";
import { createMockX402Client } from "./x402-client.js";
import { createMockZauthClient } from "./zauth-client.js";
import { estimateCycleCost } from "./real-endpoints.js";
import * as readline from "readline";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncates a wallet address for display (e.g., "7xKp...3mNq")
 */
function truncateWalletAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Derives the public key (wallet address) from a private key.
 * Handles both Base (EVM) and Solana networks.
 */
async function getWalletAddress(
  config: Config,
  network: Network
): Promise<string> {
  try {
    if (network === "base") {
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(config.evmPrivateKey as `0x${string}`);
      return account.address;
    } else {
      const { base58 } = await import("@scure/base");
      const { createKeyPairFromBytes, getAddressFromPublicKey } = await import(
        "@solana/kit"
      );

      const privateKeyBytes = base58.decode(config.solanaPrivateKey);
      const keyPair = await createKeyPairFromBytes(privateKeyBytes);
      const address = await getAddressFromPublicKey(keyPair.publicKey);
      return address;
    }
  } catch (error) {
    // Fallback: return truncated key indicator
    const key = network === "base" ? config.evmPrivateKey : config.solanaPrivateKey;
    return `[key:${truncateWalletAddress(key)}]`;
  }
}

/**
 * USDC token addresses
 */
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * Fetches the USDC balance for a wallet address.
 * Handles both Base (EVM) and Solana networks.
 * Returns balance in USDC (6 decimals precision).
 */
async function getWalletUsdcBalance(
  walletAddress: string,
  config: Config,
  network: Network
): Promise<{ balance: number; error?: string }> {
  try {
    if (network === "base") {
      // EVM/Base: Use eth_call to read USDC balance
      const balanceOfSelector = "0x70a08231"; // balanceOf(address)
      const paddedAddress = walletAddress.slice(2).padStart(64, "0");
      const callData = balanceOfSelector + paddedAddress;

      const response = await fetch(config.baseRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: BASE_USDC_ADDRESS,
              data: callData,
            },
            "latest",
          ],
        }),
      });

      const data = await response.json() as {
        result?: string;
        error?: { message: string };
      };

      if (data.error) {
        return { balance: 0, error: data.error.message };
      }

      if (!data.result || data.result === "0x") {
        return { balance: 0 };
      }

      // USDC has 6 decimals
      const balanceWei = BigInt(data.result);
      const balance = Number(balanceWei) / 1_000_000;
      return { balance };
    } else {
      // Solana: Use getTokenAccountsByOwner RPC method
      const response = await fetch(config.solanaRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            walletAddress,
            { mint: SOLANA_USDC_MINT },
            { encoding: "jsonParsed" },
          ],
        }),
      });

      const data = await response.json() as {
        result?: {
          value?: Array<{
            account: {
              data: {
                parsed: {
                  info: {
                    tokenAmount: {
                      uiAmount: number;
                    };
                  };
                };
              };
            };
          }>;
        };
        error?: { message: string };
      };

      if (data.error) {
        return { balance: 0, error: data.error.message };
      }

      if (!data.result?.value || data.result.value.length === 0) {
        return { balance: 0 }; // No USDC token account found
      }

      // Sum up all USDC token accounts (typically just one)
      const totalBalance = data.result.value.reduce((sum, account) => {
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        return sum + (amount || 0);
      }, 0);

      return { balance: totalBalance };
    }
  } catch (error) {
    return {
      balance: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Displays wallet USDC balance and exits.
 */
async function showWalletBalance(config: Config, network: Network): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("WALLET BALANCE");
  console.log("=".repeat(60));

  console.log(`Network: ${network.toUpperCase()}`);
  const walletAddress = await getWalletAddress(config, network);
  console.log(`Wallet: ${truncateWalletAddress(walletAddress)}`);
  console.log(`Full address: ${walletAddress}`);
  const rpcUrl = network === "base" ? config.baseRpcUrl : config.solanaRpcUrl;
  console.log(`RPC: ${rpcUrl}`);
  console.log("");

  const { balance, error } = await getWalletUsdcBalance(
    walletAddress,
    config,
    network
  );

  if (error) {
    console.log(`❌ Error fetching balance: ${error}`);
  } else {
    console.log(`USDC Balance: $${balance.toFixed(6)}`);
  }

  console.log("=".repeat(60) + "\n");
}

/**
 * Prompts user for confirmation before spending real money.
 * Returns true if user confirms (presses 'y'), false otherwise.
 */
async function confirmRealModeSpend(params: {
  budgetUsdc: number;
  estimatedSpendUsdc: number;
  walletAddress: string;
  trials: number;
  cycles: number;
  network: Network;
}): Promise<boolean> {
  const { budgetUsdc, estimatedSpendUsdc, walletAddress, trials, cycles, network } =
    params;

  console.log("\n⚠️  REAL MODE - This will spend actual USDC!\n");
  console.log(`  Network:    ${network.toUpperCase()}`);
  console.log(`  Budget:     $${budgetUsdc.toFixed(2)}`);
  console.log(
    `  Est. spend: $${estimatedSpendUsdc.toFixed(2)} (${trials} trials × ${cycles} cycles × ~$${(estimatedSpendUsdc / (trials * cycles * 2)).toFixed(4)}/cycle)`
  );
  console.log(`  Wallet:     ${truncateWalletAddress(walletAddress)}`);
  console.log("");

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle terminal that isn't a TTY (e.g., piped input)
    if (!process.stdin.isTTY) {
      rl.close();
      console.log("  Non-interactive terminal. Use --yes to skip confirmation.");
      resolve(false);
      return;
    }

    rl.question("  Press 'y' to continue, any other key to abort: ", (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === "y";
      if (!confirmed) {
        console.log("\n  Aborted by user.\n");
      }
      resolve(confirmed);
    });
  });
}

async function runIteration(
  iteration: number,
  mode: ExperimentMode,
  config: Config,
  x402Client: Awaited<ReturnType<typeof createX402Client>>,
  zauthClient: Awaited<ReturnType<typeof createZauthClient>>
): Promise<IterationResult> {
  const endpoint = selectRandomEndpoint(MOCK_ENDPOINTS);
  const timestamp = new Date();

  // Default result structure
  const result: IterationResult = {
    iteration,
    timestamp,
    endpoint: endpoint.url,
    mode,
    zauthChecked: false,
    zauthScore: null,
    zauthSkipped: false,
    skipReason: null,
    paymentAttempted: false,
    paymentSucceeded: false,
    responseValid: false,
    burnUsdc: 0,
    spentUsdc: 0,
    latencyMs: 0,
    errorMessage: null,
  };

  // Step 1: If with-zauth mode, check reliability first
  if (mode === "with-zauth") {
    const zauthResult = await checkEndpointReliability(zauthClient, endpoint);
    result.zauthChecked = zauthResult.checked;
    result.zauthScore = zauthResult.score;

    if (zauthResult.shouldSkip) {
      result.zauthSkipped = true;
      result.skipReason = zauthResult.skipReason;
      result.latencyMs = zauthResult.latencyMs;
      // In real mode, we'd pay for the zauth check (~$0.005)
      // In mock mode, it's free
      if (config.mode !== "mock") {
        result.spentUsdc = 0.005; // zauth check cost
      }
      return result;
    }
  }

  // Step 2: Query the endpoint (with payment)
  result.paymentAttempted = true;
  const queryResult = await queryEndpoint(x402Client, endpoint, config);

  result.paymentSucceeded = queryResult.paymentMade;
  result.responseValid = queryResult.responseValid;
  result.latencyMs = queryResult.latencyMs;
  result.errorMessage = queryResult.error || null;

  // Calculate spend and burn
  if (queryResult.paymentMade) {
    result.spentUsdc = endpoint.priceUsdc;

    // Burn = money spent on invalid responses
    if (!queryResult.responseValid) {
      result.burnUsdc = endpoint.priceUsdc;
    }
  }

  // Add zauth check cost if applicable
  if (mode === "with-zauth" && config.mode !== "mock") {
    result.spentUsdc += 0.005;
  }

  return result;
}

async function runExperiment(config: Config): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("ZAUTH X402 BURN REDUCTION EXPERIMENT");
  console.log("=".repeat(60));
  console.log(`Mode: ${config.mode}`);
  console.log(`Iterations: ${config.iterations}`);
  console.log(`Delay: ${config.delayMs}ms`);
  console.log(`Max Spend: $${config.maxUsdcSpend}`);
  if (config.mode === "mock") {
    console.log(`Mock Failure Rate: ${(config.mockFailureRate * 100).toFixed(0)}%`);
  }
  console.log("=".repeat(60) + "\n");

  // Initialize clients
  console.log("Initializing clients...");
  const x402Client = await createX402Client(config);
  const zauthClient = await createZauthClient(config);
  console.log("Clients initialized.\n");

  const metrics = new MetricsCollector(config);

  // Determine which modes to run
  let modesToRun: ExperimentMode[];
  if (config.mode === "mock") {
    // In mock mode, run both scenarios for comparison
    modesToRun = ["no-zauth", "with-zauth"];
  } else {
    modesToRun = [config.mode];
  }

  const iterationsPerMode = Math.floor(config.iterations / modesToRun.length);

  for (const mode of modesToRun) {
    console.log(`\n--- Running ${mode} mode (${iterationsPerMode} iterations) ---\n`);

    for (let i = 0; i < iterationsPerMode; i++) {
      // Check spend limit
      if (metrics.isSpendLimitReached()) {
        console.log(
          `\nSpend limit reached ($${config.maxUsdcSpend}). Stopping.`
        );
        break;
      }

      const result = await runIteration(
        i + 1,
        mode,
        config,
        x402Client,
        zauthClient
      );
      metrics.addResult(result);

      // Progress indicator (every 10 iterations if not verbose)
      if (!config.verbose && (i + 1) % 10 === 0) {
        const spent = metrics.getTotalSpent();
        process.stdout.write(
          `\rProgress: ${i + 1}/${iterationsPerMode} | Spent: $${spent.toFixed(4)}`
        );
      }

      // Delay between iterations
      if (i < iterationsPerMode - 1) {
        await sleep(config.delayMs);
      }
    }

    console.log("\n");
  }

  // Print results
  metrics.printSummaryTable();

  // Export to CSV
  await metrics.exportToCsv();

  // Calculate and print opportunity sizing
  const results = metrics.getResults();
  const noZauthResults = results.filter((r) => r.mode === "no-zauth");
  const experimentBurnRate =
    noZauthResults.length > 0
      ? noZauthResults.reduce((sum, r) => sum + r.burnUsdc, 0) /
        noZauthResults.reduce((sum, r) => sum + r.spentUsdc, 0)
      : undefined;

  printOpportunitySizing(DEFAULT_OPPORTUNITY_PARAMS, experimentBurnRate);

  console.log("\n" + "=".repeat(60));
  console.log("EXPERIMENT COMPLETE");
  console.log("=".repeat(60) + "\n");
}

// Parse CLI arguments
interface CliArgs {
  mode: 'study' | 'experiment' | 'agent' | 'balance';
  trials?: number;
  cycles?: number;
  seed?: number;
  real?: boolean;
  budget?: number;
  yes?: boolean;
  help?: boolean;
  balance?: boolean;
  agentMode?: 'no-zauth' | 'with-zauth';
  network: Network;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { mode: 'experiment', network: 'base' };

  for (const arg of args) {
    if (arg === '--study') {
      result.mode = 'study';
    } else if (arg === '--agent') {
      result.mode = 'agent';
    } else if (arg.startsWith('--trials=')) {
      result.trials = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--cycles=')) {
      result.cycles = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--seed=')) {
      result.seed = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--mode=')) {
      const mode = arg.split('=')[1];
      if (mode === 'no-zauth' || mode === 'with-zauth') {
        result.agentMode = mode;
      }
    } else if (arg.startsWith('--network=')) {
      const network = arg.split('=')[1];
      if (network === 'base' || network === 'solana') {
        result.network = network;
      } else {
        console.error(`Invalid network: ${network}. Valid options: base, solana`);
        process.exit(1);
      }
    } else if (arg === '--real') {
      result.real = true;
    } else if (arg.startsWith('--budget=')) {
      result.budget = parseFloat(arg.split('=')[1]);
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--balance') {
      result.mode = 'balance';
      result.balance = true;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Zauth x402 Burn Reduction Study

USAGE:
  npx tsx src/index.ts [OPTIONS]

OPTIONS:
  --study              Run scientific study comparing no-zauth vs with-zauth
  --agent              Run single yield optimization agent (debugging mode)
  --balance            Show wallet USDC balance and exit
  --mode=MODE          Agent mode: no-zauth or with-zauth (default: with-zauth)
  --network=NETWORK    Network: base or solana (default: base)
  --trials=N           Number of trials per condition (default: 10)
  --cycles=N           Number of optimization cycles per trial/agent (default: 50)
  --seed=N             Random seed for reproducibility (default: random)
  --real               Use real x402 payments instead of mock (default: mock)
  --budget=N           Max USDC spend limit (required for --real mode)
  --yes, -y            Skip confirmation prompt for real mode (use in scripts)
  --help, -h           Show this help message

NETWORKS:
  base                 Use Base L2 (EVM) - more x402 endpoints available
  solana               Use Solana mainnet

EXAMPLES:
  # Run full scientific study (mock mode)
  npx tsx src/index.ts --study --trials=10 --cycles=50

  # Run study on Base with real payments ($5 budget)
  npx tsx src/index.ts --study --real --network=base --budget=5.00

  # Run study on Solana with real payments
  npx tsx src/index.ts --study --real --network=solana --budget=5.00

  # Show wallet USDC balance on Base
  npx tsx src/index.ts --balance --network=base

  # Show wallet USDC balance on Solana
  npx tsx src/index.ts --balance --network=solana

  # Run quick test study
  npx tsx src/index.ts --study --trials=2 --cycles=5

  # Run single agent in with-zauth mode (debugging)
  npx tsx src/index.ts --agent --mode=with-zauth --cycles=5

  # Run study with reproducible seed
  npx tsx src/index.ts --study --seed=12345

  # Run original experiment (legacy mode)
  npx tsx src/index.ts
`);
}

// Main entry point
async function main(): Promise<void> {
  try {
    const cliArgs = parseCliArgs();

    // Show help if requested
    if (cliArgs.help) {
      printHelp();
      process.exit(0);
    }

    // Handle --balance mode
    if (cliArgs.mode === 'balance') {
      const config = loadConfig();
      const network = cliArgs.network;
      if (network === 'base') {
        if (!config.evmPrivateKey || config.evmPrivateKey === 'mock') {
          console.error("\nError: EVM_PRIVATE_KEY is required for --balance on Base.");
          console.error("Set it in your .env file or environment.\n");
          process.exit(1);
        }
      } else {
        if (!config.solanaPrivateKey || config.solanaPrivateKey === 'mock') {
          console.error("\nError: SOLANA_PRIVATE_KEY is required for --balance on Solana.");
          console.error("Set it in your .env file or environment.\n");
          process.exit(1);
        }
      }
      await showWalletBalance(config, network);
      process.exit(0);
    }

    // Handle --agent mode (debugging)
    if (cliArgs.mode === 'agent') {
      const agentMode = cliArgs.agentMode ?? 'with-zauth';
      const cycles = cliArgs.cycles ?? 5;
      const seed = cliArgs.seed ?? Date.now();

      console.log("\n" + "=".repeat(60));
      console.log("YIELD OPTIMIZER AGENT - DEBUG MODE");
      console.log("=".repeat(60));
      console.log(`Mode: ${agentMode}`);
      console.log(`Cycles: ${cycles}`);
      console.log(`Seed: ${seed}`);
      console.log("=".repeat(60) + "\n");

      // Create verbose config
      const config: Config = {
        evmPrivateKey: 'mock',
        baseRpcUrl: 'mock',
        solanaPrivateKey: 'mock',
        solanaRpcUrl: 'mock',
        mode: 'mock',
        iterations: cycles,
        delayMs: 0,
        maxUsdcSpend: 999999,
        mockFailureRate: 0.3,
        zauthDirectoryUrl: 'mock',
        zauthCheckUrl: 'mock',
        outputDir: 'results',
        verbose: true, // Enable verbose output
      };

      // Create seeded RNG for deterministic behavior
      const createSeededRng = (seed: number) => {
        let state = seed;
        return {
          next: () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
          }
        };
      };

      const rng = createSeededRng(seed);

      // Create clients
      const x402Client = createMockX402Client(config, rng);
      const zauthClient = createMockZauthClient(config, rng);

      // Create agent (mock mode = mock endpoints)
      const agent = new YieldOptimizerAgent(
        agentMode,
        config,
        x402Client,
        agentMode === 'with-zauth' ? zauthClient : undefined,
        "mock" // Agent debug mode always uses mock endpoints
      );

      // Run optimization cycles
      let totalSpent = 0;
      let totalBurn = 0;
      let totalZauthCost = 0;
      let totalQueriesAttempted = 0;
      let totalQueriesFailed = 0;

      for (let i = 0; i < cycles; i++) {
        console.log(`\n--- Cycle ${i + 1}/${cycles} ---\n`);

        const result = await agent.runOptimizationCycle();

        // Show results
        console.log(`\nPool Data (${result.poolData.length} pools):`);
        result.poolData.forEach((pool, idx) => {
          console.log(
            `  ${idx + 1}. ${pool.poolId}: ${pool.tokenA}-${pool.tokenB} | ` +
            `APY: ${pool.apy.toFixed(2)}% | TVL: $${(pool.tvl / 1_000_000).toFixed(2)}M | ` +
            `IL Risk: ${pool.impermanentLossRisk}`
          );
        });

        console.log(`\nWhale Activity (${result.whaleData.length} moves):`);
        result.whaleData.forEach((whale, idx) => {
          console.log(
            `  ${idx + 1}. ${whale.wallet}: ${whale.action} ${whale.amount.toLocaleString()} ${whale.token} | ` +
            `Significance: ${(whale.significance * 100).toFixed(0)}%`
          );
        });

        console.log(`\nSentiment Data (${result.sentimentData.length} scores):`);
        result.sentimentData.forEach((sentiment, idx) => {
          const scoreStr = sentiment.score > 0 ? `+${sentiment.score.toFixed(2)}` : sentiment.score.toFixed(2);
          console.log(
            `  ${idx + 1}. ${sentiment.token}: ${scoreStr} | ` +
            `Confidence: ${(sentiment.confidence * 100).toFixed(0)}%`
          );
        });

        console.log(`\nOptimal Allocation:`);
        console.log(`  Pool: ${result.allocation.poolId}`);
        console.log(`  Percentage: ${result.allocation.percentage}%`);
        console.log(`  Reasoning: ${result.allocation.reasoning}`);

        console.log(`\nCycle Metrics:`);
        console.log(`  Queries Attempted: ${result.queriesAttempted}`);
        console.log(`  Queries Failed: ${result.queriesFailed}`);
        console.log(`  Total Spent: $${result.totalSpent.toFixed(6)}`);
        console.log(`  Total Burn: $${result.totalBurn.toFixed(6)}`);
        if (agentMode === 'with-zauth') {
          console.log(`  Zauth Cost: $${result.zauthCost.toFixed(6)}`);
        }
        console.log(`  Burn Rate: ${result.totalSpent > 0 ? ((result.totalBurn / result.totalSpent) * 100).toFixed(2) : 0}%`);

        // Accumulate totals
        totalSpent += result.totalSpent;
        totalBurn += result.totalBurn;
        totalZauthCost += result.zauthCost;
        totalQueriesAttempted += result.queriesAttempted;
        totalQueriesFailed += result.queriesFailed;
      }

      // Summary
      console.log("\n" + "=".repeat(60));
      console.log("SUMMARY");
      console.log("=".repeat(60));
      console.log(`Total Cycles: ${cycles}`);
      console.log(`Total Queries Attempted: ${totalQueriesAttempted}`);
      console.log(`Total Queries Failed: ${totalQueriesFailed}`);
      console.log(`Failure Rate: ${totalQueriesAttempted > 0 ? ((totalQueriesFailed / totalQueriesAttempted) * 100).toFixed(2) : 0}%`);
      console.log(`Total Spent: $${totalSpent.toFixed(6)}`);
      console.log(`Total Burn: $${totalBurn.toFixed(6)}`);
      if (agentMode === 'with-zauth') {
        console.log(`Total Zauth Cost: $${totalZauthCost.toFixed(6)}`);
        const netSpent = totalSpent - totalZauthCost;
        console.log(`Net Spent (excl. Zauth): $${netSpent.toFixed(6)}`);
      }
      console.log(`Burn Rate: ${totalSpent > 0 ? ((totalBurn / totalSpent) * 100).toFixed(2) : 0}%`);
      console.log(`Avg Spend per Cycle: $${(totalSpent / cycles).toFixed(6)}`);
      console.log(`Avg Burn per Cycle: $${(totalBurn / cycles).toFixed(6)}`);
      console.log("=".repeat(60) + "\n");

      return;
    }

    // Handle --study mode
    if (cliArgs.mode === 'study') {
      const trials = cliArgs.trials ?? 10;
      const cycles = cliArgs.cycles ?? 50;
      const baseSeed = cliArgs.seed ?? Date.now();
      const mockMode = !cliArgs.real;
      const budgetUsdc = cliArgs.budget;
      const network = cliArgs.network;

      console.log("\n" + "=".repeat(60));
      console.log("ZAUTH X402 SCIENTIFIC STUDY");
      console.log("=".repeat(60));
      console.log(`Network: ${network.toUpperCase()}`);
      console.log(`Trials per condition: ${trials}`);
      console.log(`Cycles per trial: ${cycles}`);
      console.log(`Base seed: ${baseSeed}`);
      console.log(`Payment mode: ${mockMode ? 'MOCK' : 'REAL'}`);
      if (budgetUsdc !== undefined) {
        console.log(`Budget: $${budgetUsdc.toFixed(2)}`);
      }
      console.log("=".repeat(60) + "\n");

      // Create base config (load from .env or use defaults)
      let baseConfig: Config;
      if (mockMode) {
        // Use minimal mock config for study mode
        baseConfig = {
          evmPrivateKey: 'mock',
          baseRpcUrl: 'mock',
          solanaPrivateKey: 'mock',
          solanaRpcUrl: 'mock',
          mode: 'mock',
          iterations: cycles,
          delayMs: 0,
          maxUsdcSpend: 999999,
          mockFailureRate: 0.3,
          zauthDirectoryUrl: 'mock',
          zauthCheckUrl: 'mock',
          outputDir: 'results',
          verbose: false,
        };
      } else {
        // Load actual config for real mode
        baseConfig = loadConfig();
        validateConfig(baseConfig, network);
        validateRealModeConfig(baseConfig, budgetUsdc, network);
      }

      // Safety confirmation for real mode
      if (!mockMode) {
        const skipConfirmation = cliArgs.yes ?? false;

        if (!skipConfirmation) {
          // Get wallet address for display
          const walletAddress = await getWalletAddress(baseConfig, network);

          // Estimate spend: trials × cycles × 2 conditions × cost per cycle
          const costPerCycle = estimateCycleCost(network);
          const estimatedSpend = trials * cycles * 2 * costPerCycle;

          const confirmed = await confirmRealModeSpend({
            budgetUsdc: budgetUsdc!,
            estimatedSpendUsdc: estimatedSpend,
            walletAddress,
            trials,
            cycles,
            network,
          });

          if (!confirmed) {
            process.exit(0);
          }
        } else {
          console.log("⚠️  REAL MODE - Skipping confirmation (--yes flag)\n");
        }
      }

      // Run the scientific study
      const studyConfig = {
        trialsPerCondition: trials,
        cyclesPerTrial: cycles,
        baseSeed,
        conditions: ['no-zauth', 'with-zauth'] as ["no-zauth", "with-zauth"],
        outputDir: 'results',
        mockMode,
        budgetUsdc,
        network,
      };

      console.log("Running scientific study...\n");
      const results = await runScientificStudy(studyConfig, baseConfig);

      // Print results to console
      console.log("\n");
      printFullReport(results);

      // Export results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const csvPath = `${studyConfig.outputDir}/study_${timestamp}.csv`;
      const jsonPath = `${studyConfig.outputDir}/study_${timestamp}.json`;
      const mdPath = `${studyConfig.outputDir}/study_${timestamp}.md`;

      await exportRawDataCsv(results, csvPath, studyConfig);
      await exportSummaryJson(results, jsonPath, studyConfig);
      await generateMarkdownReport(results, mdPath, studyConfig);

      console.log("\nExported results:");
      console.log(`  CSV:  ${csvPath}`);
      console.log(`  JSON: ${jsonPath}`);
      console.log(`  MD:   ${mdPath}`);

      console.log("\n" + "=".repeat(60));
      console.log("STUDY COMPLETE");
      console.log("=".repeat(60) + "\n");

      return;
    }

    // Legacy experiment mode
    const config = loadConfig();
    validateConfig(config);

    // Safety warning for non-mock modes
    if (config.mode !== "mock") {
      console.log("\n⚠️  WARNING: Running in REAL mode!");
      console.log("This will spend actual USDC on x402 payments.");
      console.log(`Max spend limit: $${config.maxUsdcSpend}`);
      console.log("Press Ctrl+C within 5 seconds to abort...\n");
      await sleep(5000);
    }

    await runExperiment(config);
  } catch (error) {
    console.error(
      "\nError:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
