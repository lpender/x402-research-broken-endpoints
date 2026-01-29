# PRD: Wire Up Real x402 Payments

---

## Executive Summary

Connect the existing study runner to real x402 payments, allowing users to run studies with actual USDC spend. Sprint 1 built the simulation framework; this sprint makes `--real` mode functional.

---

## Problem Statement

The `--real` CLI flag exists but doesn't actually use real payments. The study runner always calls `createMockX402Client()` regardless of the `mockMode` flag. Users need to run studies with real money to validate findings against live endpoint behavior.

---

## Goals

1. **Wire up RealX402Client** - Study runner uses real client when `--real` is passed
2. **Safety guardrails** - Spend limits, confirmations, budget tracking
3. **Real endpoint registry** - Configure actual x402-enabled endpoints
4. **Budget control** - User specifies max spend (e.g., $5) and study stops if exceeded

---

## Current State

- `RealX402Client` exists in `src/x402-client.ts` (lines 77-159)
- Uses `@x402/fetch` to wrap fetch with payment handling
- Study runner at `src/study.ts:248` always calls `createMockX402Client()`
- `--real` flag is parsed but only changes console output

---

## Implementation Tasks

### Task 1: Install x402 Dependencies

```bash
npm install @x402/fetch @x402/svm @solana/kit @scure/base
```

**Acceptance Criteria:**
- All packages install without errors
- TypeScript types resolve correctly
- `RealX402Client.initialize()` succeeds with valid credentials

### Task 2: Wire Study Runner to Real Client

Modify `src/study.ts` to use `RealX402Client` when `mockMode=false`:

```typescript
// Current (always mock):
const x402Client = createMockX402Client(config, rng, mockMode);

// New (conditional):
const x402Client = mockMode
  ? createMockX402Client(config, rng)
  : await createRealX402Client(config);
```

**Acceptance Criteria:**
- `runTrial()` accepts client factory or pre-built client
- Real mode initializes `RealX402Client` once per study (not per trial)
- Mock mode behavior unchanged

### Task 3: Add Spend Limit Tracking

Track cumulative spend and abort if budget exceeded:

```typescript
interface SpendTracker {
  budgetUsdc: number;
  spentUsdc: number;

  recordSpend(amount: number): void;
  canSpend(amount: number): boolean;
  getRemainingBudget(): number;
}
```

CLI: `--budget=5.00` sets max spend (required for `--real` mode)

**Acceptance Criteria:**
- Study aborts gracefully when budget exhausted
- Partial results saved before abort
- Clear message showing spend vs budget

### Task 4: Real Endpoint Registry

Create `src/real-endpoints.ts` with actual x402-enabled endpoints:

```typescript
interface RealEndpoint {
  url: string;
  name: string;
  category: 'pool' | 'whale' | 'sentiment';
  priceUsdc: number;
  x402Enabled: boolean;
}

// Example (replace with actual endpoints):
const REAL_ENDPOINTS: RealEndpoint[] = [
  {
    url: 'https://api.example.com/pools',
    name: 'Pool Data Provider',
    category: 'pool',
    priceUsdc: 0.01,
    x402Enabled: true,
  },
  // ...
];
```

**Acceptance Criteria:**
- At least 3 real x402 endpoints configured (pool, whale, sentiment)
- Endpoints respond to x402 payment protocol
- Fallback to mock if no real endpoints available

### Task 5: Environment Configuration

Create `.env.example` with required variables:

```bash
# Solana wallet (base58 private key)
SOLANA_PRIVATE_KEY=your_private_key_here

# RPC endpoint
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Budget limit for real mode (USDC)
MAX_USDC_SPEND=5.00

# Zauth endpoints (optional, for with-zauth mode)
ZAUTH_DIRECTORY_URL=https://back.zauthx402.com/api/verification/directory
ZAUTH_CHECK_URL=https://back.zauthx402.com/api/verification/check
```

**Acceptance Criteria:**
- `.env.example` documents all required variables
- `loadConfig()` validates required vars for real mode
- Clear error messages for missing config

### Task 6: Safety Confirmations

Add interactive confirmation before spending real money:

```
⚠️  REAL MODE - This will spend actual USDC!

  Budget:     $5.00
  Est. spend: $4.50 (10 trials × 50 cycles × ~$0.009/cycle)
  Wallet:     7xKp...3mNq

  Press 'y' to continue, any other key to abort:
```

**Acceptance Criteria:**
- Shows budget, estimated spend, wallet address
- Requires explicit confirmation (not just timeout)
- `--yes` flag skips confirmation for scripted runs

---

## CLI Changes

```bash
# Run study with real payments ($5 budget)
npx tsx src/index.ts --study --real --budget=5.00

# Skip confirmation prompt
npx tsx src/index.ts --study --real --budget=5.00 --yes

# Show wallet balance before running
npx tsx src/index.ts --balance
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Real payments work | Study completes with actual x402 transactions |
| Budget respected | Study stops at budget limit |
| No accidental spend | Confirmation required, clear warnings |

---

## Testing Plan

1. **Unit test** - SpendTracker enforces limits
2. **Integration test** - RealX402Client initializes with test wallet
3. **E2E test** - Small study ($0.50) completes with real payments
4. **Budget test** - Study stops when budget exhausted

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/study.ts` | Modify | Wire up real client conditionally |
| `src/x402-client.ts` | Modify | Export factory for real client |
| `src/real-endpoints.ts` | Create | Registry of real x402 endpoints |
| `src/spend-tracker.ts` | Create | Budget tracking and enforcement |
| `src/index.ts` | Modify | Add --budget, --yes, --balance flags |
| `.env.example` | Create | Document required environment vars |

---

## Verification

After implementation:

1. Create `.env` with test wallet containing ~$5 USDC
2. Run `npx tsx src/index.ts --balance` to verify wallet access
3. Run `npx tsx src/index.ts --study --real --budget=1.00 --trials=2 --cycles=3`
4. Verify transactions on Solana explorer
5. Check results show real endpoint responses (not mock data)

---

## Out of Scope

- Multiple wallet support
- Automatic USDC refills
- Transaction retry logic (rely on x402 library)
- Price oracle integration (use fixed prices from endpoint registry)
