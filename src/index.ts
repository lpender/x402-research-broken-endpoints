#!/usr/bin/env node

import {
  loadConfig,
  validateConfig,
  validateRealModeConfig,
  type Config,
  type Network,
} from "./config.js";
import { runScientificStudy } from "./study.js";
import { printFullReport, exportRawDataCsv, exportSummaryJson, generateMarkdownReport } from "./report.js";
import { YieldOptimizerAgent } from "./yield-agent.js";
import { createMockX402Client } from "./x402-client.js";
import { createMockZauthClient } from "./zauth-client.js";
import { estimateCycleCost, BazaarDiscoveryError } from "./real-endpoints.js";
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


// Parse CLI arguments
interface CliArgs {
  mode: 'study' | 'agent' | 'balance';
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
  stage?: number;
  loadStage1?: string;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { mode: 'study', network: 'base' };

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
    } else if (arg.startsWith('--stage=')) {
      result.stage = parseInt(arg.split('=')[1], 10);
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
    } else if (arg.startsWith('--load-stage1=')) {
      result.loadStage1 = arg.split('=')[1];
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
  --agent              Run single yield optimization agent
  --stage=N            Run specific stage (1=discovery, 2+=future)
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

STAGES:
  1                    Discovery & 402 prepayment analysis (no payment required)
  2-4                  Future stages (not yet implemented)

EXAMPLES:
  # Stage 1: Discover endpoints and test 402 implementation
  npx tsx src/index.ts --agent --stage=1
  task stage:1

  # Stage 1 on Solana network
  npx tsx src/index.ts --agent --stage=1 --network=solana
  task stage:1 -- --network=solana

  # Run full scientific study (mock mode)
  npx tsx src/index.ts --study --trials=10 --cycles=50

  # Run study on Base with real payments ($5 budget)
  npx tsx src/index.ts --study --real --network=base --budget=5.00

  # Show wallet USDC balance on Base
  npx tsx src/index.ts --balance --network=base

  # Run single agent in with-zauth mode (full optimization)
  npx tsx src/index.ts --agent --mode=with-zauth --cycles=5
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

    // Handle --agent mode
    if (cliArgs.mode === 'agent') {
      const stage = cliArgs.stage ?? undefined;
      const agentMode = cliArgs.agentMode ?? 'with-zauth';
      const cycles = cliArgs.cycles ?? 5;
      const seed = cliArgs.seed ?? Date.now();
      const network = cliArgs.network;
      const mockMode = !cliArgs.real;

      // Stage 1: Discovery & 402 Prepayment Analysis
      if (stage === 1) {
        console.log("\n" + "=".repeat(60));
        console.log("STAGE 1: DISCOVERY & 402 PREPAYMENT ANALYSIS");
        console.log("=".repeat(60));
        console.log(`Network: ${network.toUpperCase()}`);
        console.log("=".repeat(60) + "\n");

        // Load minimal config (just need Bazaar URL)
        const config = loadConfig();

        // Always initialize Bazaar client for Stage 1
        const { BazaarDiscoveryClient } = await import('./bazaar-client.js');
        const bazaarClient = new BazaarDiscoveryClient(
          config.bazaarUrl,
          config.bazaarCacheTtl
        );

        // Create agent (always use "real" endpoint source for Stage 1)
        const agent = new YieldOptimizerAgent(
          'no-zauth',
          config,
          null as any, // No x402 client needed
          undefined,
          'real', // Always real endpoints
          network,
          bazaarClient
        );

        // Track duration
        const startTime = Date.now();

        // Run discovery and print report
        const result = await agent.runDiscoveryStage();
        const { printDiscoveryReport } = await import('./discovery-report.js');
        printDiscoveryReport(result, network);

        // Calculate duration
        const durationSeconds = (Date.now() - startTime) / 1000;

        // Get query parameters and filtering stats for comprehensive documentation
        const queryParams = bazaarClient.getLastQueryParams();
        const filteringStats = agent.getFilteringStats();

        // Validate we have the required metadata
        if (!queryParams) {
          console.error('\n⚠️  Warning: Could not capture query parameters');
          return;
        }

        if (!filteringStats) {
          console.error('\n⚠️  Warning: Could not capture filtering statistics');
          return;
        }

        // Export to organized folder structure
        const { exportStage1Results } = await import('./stage1-output.js');
        const networkId = network === 'base' ? 'eip155:8453' : 'solana';
        const paths = await exportStage1Results(
          result,
          network,
          networkId,
          queryParams,
          filteringStats,
          durationSeconds
        );

        console.log(`\n✅ Stage 1 complete!`);
        console.log(`📁 Results folder: ${paths.folderPath}\n`);
        console.log(`Files created:`);
        console.log(`  - ${paths.readmePath}`);
        console.log(`  - ${paths.discoveryJsonPath}`);
        console.log(`  - ${paths.endpointsJsonPath}\n`);

        return;
      }

      // Stage 2: Real Yield Optimization with Interleaved Comparison
      if (stage === 2) {
        // Validation
        if (!cliArgs.real) {
          console.error("❌ Stage 2 requires --real mode");
          process.exit(1);
        }
        if (!cliArgs.budget) {
          console.error("❌ Stage 2 requires --budget=<amount>");
          process.exit(1);
        }
        if (!cliArgs.loadStage1) {
          console.error("❌ Stage 2 requires --load-stage1=<path>");
          process.exit(1);
        }

        // Auto-detect network from Stage 1 path
        const { detectNetworkFromPath, loadStage1Endpoints } = await import('./stage2-loader.js');
        const detectedNetwork = detectNetworkFromPath(cliArgs.loadStage1);

        // Validate network if user specified --network flag
        if (cliArgs.network !== 'base') {
          // User explicitly set --network (not the default)
          if (cliArgs.network !== detectedNetwork) {
            console.error(`❌ Network mismatch: Stage 1 used ${detectedNetwork}, but --network=${cliArgs.network} specified`);
            console.error(`   Stage 2 must use the same network as Stage 1`);
            process.exit(1);
          }
        }

        // Use detected network
        const stage2Network = detectedNetwork;

        console.log("\n" + "=".repeat(60));
        console.log("STAGE 2: REAL YIELD OPTIMIZATION - INTERLEAVED COMPARISON");
        console.log("=".repeat(60));
        console.log(`Network: ${stage2Network.toUpperCase()} (auto-detected from Stage 1)`);
        console.log("=".repeat(60) + "\n");

        // Load config and validate
        const config = loadConfig();
        validateRealModeConfig(config, cliArgs.budget, stage2Network);

        // Check wallet balance before proceeding
        const walletAddress = await getWalletAddress(config, stage2Network);
        const { balance: usdcBalance, error: balanceError } = await getWalletUsdcBalance(
          walletAddress,
          config,
          stage2Network
        );

        if (balanceError) {
          console.error(`❌ Failed to check wallet balance: ${balanceError}`);
          console.error(`   Cannot proceed without verifying sufficient funds`);
          process.exit(1);
        }

        // Require balance >= budget (for endpoint payments)
        // Plus recommend extra for gas fees
        const requiredBalance = cliArgs.budget;
        const recommendedBalance = cliArgs.budget * 1.5; // 50% extra for gas

        console.log(`\n💰 Wallet Balance Check:`);
        console.log(`   Address: ${truncateWalletAddress(walletAddress)}`);
        console.log(`   Balance: $${usdcBalance.toFixed(6)} USDC`);
        console.log(`   Required: $${requiredBalance.toFixed(6)} USDC (budget)`);
        console.log(`   Recommended: $${recommendedBalance.toFixed(6)} USDC (budget + gas)\n`);

        if (usdcBalance < requiredBalance) {
          console.error(`❌ Insufficient USDC balance!`);
          console.error(`\nYour wallet has $${usdcBalance.toFixed(6)} but Stage 2 requires $${requiredBalance.toFixed(2)}`);
          console.error(`\nTo add USDC to your wallet:`);
          console.error(`   1. Network: Base (Chain ID: 8453)`);
          console.error(`   2. Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)`);
          console.error(`   3. Address: ${walletAddress}`);
          console.error(`   4. Amount: At least $${recommendedBalance.toFixed(2)} USDC (includes gas)`);
          console.error(`\nOptions:`);
          console.error(`   - Bridge: https://bridge.base.org`);
          console.error(`   - Buy on Coinbase and withdraw to Base`);
          console.error(`   - Transfer from another wallet`);
          process.exit(1);
        }

        if (usdcBalance < recommendedBalance) {
          console.log(`⚠️  Warning: Balance is close to budget`);
          console.log(`   You have enough for queries but may run into gas issues`);
          console.log(`   Recommended to add $${(recommendedBalance - usdcBalance).toFixed(6)} more USDC\n`);
        } else {
          console.log(`✓ Sufficient balance for Stage 2\n`);
        }

        // Load Stage 1 results
        const endpoints = await loadStage1Endpoints(cliArgs.loadStage1);
        console.log(`✓ Loaded ${endpoints.length} endpoints from Stage 1`);

        // Filter to 402-enabled
        const paymentEndpoints = endpoints.filter(e => e.requires402);
        console.log(`✓ Filtered to ${paymentEndpoints.length} endpoints requiring payment\n`);

        // Show confirmation prompt (unless --yes)
        if (!cliArgs.yes) {
          // Estimate comparisons
          const avgPrice = paymentEndpoints.reduce((sum, e) =>
            sum + (e.requested402Price || e.price || 0.01), 0
          ) / paymentEndpoints.length;
          const estimatedComparisons = Math.floor(cliArgs.budget / (avgPrice * 2));

          console.log("⚠️  Stage 2: Interleaved Comparison (Both Modes)");
          console.log(`Endpoints available: ${paymentEndpoints.length} (402-enabled)`);
          console.log(`Budget: $${cliArgs.budget.toFixed(2)} USDC`);
          console.log(`Estimated comparisons: ~${estimatedComparisons} endpoints`);
          console.log(`Network: ${stage2Network}`);
          console.log("\nEach endpoint will be queried TWICE:");
          console.log("  1. No-zauth mode (blind query)");
          console.log("  2. With-zauth mode (reliability check first)");
          console.log("\nPress 'y' to continue or any other key to cancel.");

          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question('', (ans) => {
              rl.close();
              resolve(ans);
            });
          });

          if (answer.toLowerCase() !== 'y') {
            console.log("Cancelled.");
            process.exit(0);
          }
          console.log('');
        }

        // Initialize clients
        const { createRealX402Client } = await import('./x402-client.js');
        const { createRealZauthClient } = await import('./zauth-client.js');

        const x402Client = await createRealX402Client(config, stage2Network);
        const zauthClient = await createRealZauthClient(config, stage2Network);

        // Run Stage 2
        const startTime = Date.now();
        const { runStage2 } = await import('./stage2-runner.js');

        const result = await runStage2(
          endpoints,
          cliArgs.budget,
          stage2Network,
          config,
          x402Client,
          zauthClient
        );

        // Export results
        const { createStage2OutputFolder, exportStage2Results } = await import('./stage2-output.js');
        const timestamp = new Date().toISOString();
        const paths = createStage2OutputFolder(stage2Network, timestamp);

        await exportStage2Results(
          result,
          paths,
          stage2Network,
          config,
          cliArgs.loadStage1!  // Already validated above
        );

        // Print summary
        console.log(`\n✅ Stage 2 complete!`);
        console.log(`\n${'='.repeat(60)}`);
        console.log('COMPARISON SUMMARY');
        console.log('='.repeat(60));
        console.log(`Endpoints compared: ${result.comparisonSummary.endpointsCompared}`);
        console.log(`Budget used: $${result.comparisonSummary.budgetUsed.toFixed(3)}`);
        console.log('');
        console.log('No-Zauth:');
        console.log(`  Burn: $${result.comparisonSummary.noZauth.totalBurn.toFixed(3)} (${(result.comparisonSummary.noZauth.burnRate * 100).toFixed(1)}%)`);
        console.log(`  Allocation: ${result.noZauthResults.allocation.poolId}`);
        console.log('');
        console.log('With-Zauth:');
        console.log(`  Burn: $${result.comparisonSummary.withZauth.totalBurn.toFixed(3)} (${(result.comparisonSummary.withZauth.burnRate * 100).toFixed(1)}%)`);
        console.log(`  Zauth cost: $${result.comparisonSummary.withZauth.zauthCost.toFixed(3)}`);
        console.log(`  Allocation: ${result.withZauthResults.allocation.poolId}`);
        console.log('');
        console.log('Savings:');
        console.log(`  Net savings: $${result.comparisonSummary.totalNetSavings.toFixed(3)}`);
        console.log(`  Burn reduction: ${result.comparisonSummary.burnReduction.toFixed(1)}%`);
        console.log('');
        console.log(`📁 Results: ${paths.folderPath}`);
        console.log('='.repeat(60) + '\n');

        process.exit(0);
      }

      // Non-stage mode: regular agent debugging
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
        bazaarUrl: 'https://api.cdp.coinbase.com/platform/v2/x402',
        bazaarCacheTtl: 3600000,
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
        "mock", // Agent debug mode always uses mock endpoints
        "base", // Default network
        undefined // No Bazaar in debug mode
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
          bazaarUrl: 'https://api.cdp.coinbase.com/platform/v2/x402',
          bazaarCacheTtl: 3600000,
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

      // Initialize Bazaar client for real mode
      let bazaarClient: any = undefined;
      if (!mockMode) {
        const { BazaarDiscoveryClient } = await import('./bazaar-client.js');
        bazaarClient = new BazaarDiscoveryClient(
          baseConfig.bazaarUrl,
          baseConfig.bazaarCacheTtl
        );
        console.log(`[Bazaar] Discovery enabled (cache TTL: ${baseConfig.bazaarCacheTtl / 1000}s)\n`);
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
        bazaarClient,
      };

      console.log("Running scientific study...\n");

      let results;
      try {
        results = await runScientificStudy(studyConfig, baseConfig, bazaarClient);
      } catch (error) {
        if (error instanceof BazaarDiscoveryError) {
          console.error("\n❌ Bazaar endpoint discovery failed:");
          console.error(`   ${error.message}`);
          if (error.diagnostics) {
            console.error(`   Network: ${error.diagnostics.network}`);
            console.error(`   Items returned: ${error.diagnostics.itemsReturned}`);
          }
          console.error("\nTroubleshooting:");
          console.error("  - Check network connectivity");
          console.error("  - Verify BAZAAR_URL configuration");
          console.error("  - Run with --verbose for detailed logs");
          console.error("  - Ensure Bazaar has endpoints for your network");
          process.exit(1);
        }
        throw error;
      }

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
  } catch (error) {
    console.error(
      "\nError:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
