# Zauth x402 Burn Reduction Scientific Study

A scientific experiment that measures cost savings when using Zauth endpoint verification for DeFi AI agents making x402 micropayment API calls.

## Overview

When AI agents query DeFi data providers via x402 micropayments, they pay **before** knowing if the endpoint will return valid data. Unreliable endpoints cause "burn" - money wasted on failed or invalid responses.

This project simulates a realistic DeFi yield optimization agent to provide empirical evidence of Zauth's cost-saving benefits through controlled experiments with statistical analysis.

## How It Works

### The Agent Workflow

The `YieldOptimizerAgent` simulates a realistic DeFi trading bot that:

1. **Fetches pool data** from Raydium, Orca, Kamino (looking for highest APY)
2. **Queries whale activity** to detect large position changes
3. **Analyzes sentiment data** for market signals
4. **Calculates optimal allocation** based on aggregated data
5. **Logs recommended trades** (mock - no real transactions)

Each data fetch costs money via x402 micropayments. Failed API calls = wasted money.

### Two Experimental Conditions

**Control Group (no-zauth)**
- Agent blindly queries all endpoints
- Pays for every call, including unreliable ones
- Higher burn rate

**Treatment Group (with-zauth)**
- Agent checks Zauth reliability scores before each query
- Skips endpoints below 70% uptime threshold
- Lower burn rate (but pays small Zauth verification fees)

### Scientific Method

- **Matched trials**: Each trial pair uses the same random seed (fair comparison)
- **Statistical analysis**: Paired t-tests, 95% confidence intervals, effect size (Cohen's d)
- **Reproducibility**: Same seed → identical results
- **Default study size**: 10 trials per condition, 50 optimization cycles per trial

## Installation

```bash
# Clone and install dependencies
npm install

# Copy environment template (optional - uses mock mode by default)
cp .env.example .env
```

## Usage

### Run Full Scientific Study

```bash
# Default: 10 trials, 50 cycles per trial
npx tsx src/index.ts --study

# Quick test (2 trials, 5 cycles)
npx tsx src/index.ts --study --trials=2 --cycles=5

# Custom configuration
npx tsx src/index.ts --study --trials=20 --cycles=100 --seed=12345

# Real x402 payments (requires .env setup)
npx tsx src/index.ts --study --real
```

**Output files** (generated in `results/` directory):
- `study_TIMESTAMP.csv` - Raw per-iteration data
- `study_TIMESTAMP.json` - Aggregated results with metadata
- `study_TIMESTAMP.md` - Publication-ready markdown report

### Debug Single Agent Run

```bash
# Run agent in verbose mode (with-zauth)
npx tsx src/index.ts --agent --mode=with-zauth --cycles=5

# Compare with no-zauth mode
npx tsx src/index.ts --agent --mode=no-zauth --cycles=5

# Reproducible debug session
npx tsx src/index.ts --agent --mode=with-zauth --cycles=10 --seed=42
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--study` | Run full scientific study | - |
| `--agent` | Run single agent (debug mode) | - |
| `--mode=MODE` | Agent mode: `no-zauth` or `with-zauth` | `with-zauth` |
| `--trials=N` | Number of trials per condition | `10` |
| `--cycles=N` | Optimization cycles per trial | `50` |
| `--seed=N` | Random seed for reproducibility | `Date.now()` |
| `--real` | Use real x402 payments (not mock) | `false` |
| `--help` | Show help message | - |

## Understanding Results

### Example Output

```
╔═══════════════╤════════╤═══════════════╤════════════════╤═══════════╤═════════════╤══════════════════╗
║ Condition     │ Trials │ Total Spent   │ Total Burn     │ Burn Rate │ Net Savings │ Burn Reduction % ║
╟───────────────┼────────┼───────────────┼────────────────┼───────────┼─────────────┼──────────────────╢
║ No Zauth      │ 10     │ $5.230        │ $1.840         │ 35.18%    │ -           │ -                ║
║ With Zauth    │ 10     │ $3.680        │ $0.520         │ 14.13%    │ $1.550      │ 59.84%           ║
╚═══════════════╧════════╧═══════════════╧════════════════╧═══════════╧═════════════╧══════════════════╝

Statistical Analysis:
  Burn Reduction: 59.84%
  95% CI: [45.2%, 74.5%]
  P-value: 0.001 (highly significant)
  Effect Size: 2.8 (large effect)
  Net Savings per Cycle: $0.031
```

### Key Metrics

- **Burn Rate**: Percentage of money wasted on failed/invalid responses
- **Burn Reduction %**: How much less burn with Zauth vs without
- **Net Savings**: Total savings after deducting Zauth verification costs
- **95% CI**: Confidence interval - we're 95% confident the true effect is in this range
- **P-value**: Statistical significance (p < 0.05 = significant result)
- **Effect Size**: Practical significance (>0.8 = large effect)

### Interpreting P-values

- **p < 0.001**: Highly significant - strong evidence of real effect
- **p < 0.05**: Significant - sufficient evidence of real effect
- **p > 0.05**: Not significant - insufficient evidence (may be random chance)

## Project Structure

```
src/
├── index.ts          # CLI entry point, argument parsing
├── yield-agent.ts    # DeFi yield optimization agent
├── study.ts          # Scientific study runner with progress tracking
├── statistics.ts     # Statistical analysis functions
├── report.ts         # Results visualization and export
├── endpoints.ts      # Mock DeFi endpoints with realistic data
├── x402-client.ts    # Mock x402 micropayment client
├── zauth-client.ts   # Mock Zauth reliability client
├── types.ts          # Shared TypeScript interfaces
├── config.ts         # Configuration management
├── metrics.ts        # Metrics tracking utilities
└── opportunity.ts    # Opportunity cost calculations

results/              # Generated study outputs (CSV, JSON, MD)
prd-items.json        # Product requirements with verification status
PRD.md                # Full product requirements document
progress.txt          # Development progress log
```

## Reproducibility

Studies are fully reproducible when using the same seed:

```bash
# Run 1
npx tsx src/index.ts --study --seed=12345 --trials=5 --cycles=10

# Run 2 (identical results)
npx tsx src/index.ts --study --seed=12345 --trials=5 --cycles=10
```

The seeded random number generator ensures:
- Identical endpoint selection order
- Identical failure patterns
- Identical agent decisions
- Identical statistical results

(Note: `latencyMs` may vary slightly due to system timing, but all financial metrics are deterministic)

## Development Status

**All PRD items completed (19/19):**
- ✅ Yield optimization agent with DeFi workflow
- ✅ Mock endpoints with realistic data and configurable failures
- ✅ Scientific study runner with matched trials
- ✅ Statistical analysis (t-test, CI, effect size)
- ✅ Results reporting (console, CSV, JSON, Markdown)
- ✅ CLI interface with progress indicators
- ✅ End-to-end validation
- ✅ Reproducibility verification

TypeScript type checks passing. Ready for production use.

## Example Workflow

```bash
# 1. Quick validation test (2 minutes)
npx tsx src/index.ts --study --trials=2 --cycles=5

# 2. Check results
ls results/
cat results/study_*.md

# 3. Full study for publication (10 minutes)
npx tsx src/index.ts --study --trials=10 --cycles=50 --seed=12345

# 4. Verify reproducibility
npx tsx src/index.ts --study --trials=10 --cycles=50 --seed=12345

# 5. Debug if needed
npx tsx src/index.ts --agent --mode=with-zauth --cycles=5
```

## Real x402 Payments

By default, the study runs in **mock mode** (no real payments). To use real x402 payments:

1. Configure `.env` with Solana wallet and x402 credentials
2. Run with `--real` flag
3. Study will warn before making real payments

```bash
npx tsx src/index.ts --study --real --trials=2 --cycles=5
```

**Warning**: Real mode will spend actual USDC on x402 micropayments. Start with small trials/cycles to test.

## Contributing

See `PRD.md` for full specification and `prd-items.json` for implementation status.

Development workflow:
1. Make changes
2. Run `npx tsc --noEmit` to verify types
3. Test with `npx tsx src/index.ts --study --trials=2 --cycles=3`
4. Commit with descriptive message (see `CLAUDE.md`)

## License

Experimental research code. See repository for license details.
