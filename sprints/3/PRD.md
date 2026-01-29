# Sprint 3: E2E Validation of Real x402 Payments

## Goal
Validate that the existing real-payment infrastructure (Sprint 2) works end-to-end with actual USDC on Base network.

## Scope
- **Network:** Base (EVM) only
- **Budget:** $1 USDC
- **Approach:** Minimal - no new features, just validation

## Current State
Sprint 1-2 complete. Infrastructure ready:
- `RealX402Client` in `src/x402-client.ts`
- Real endpoints in `src/real-endpoints.ts` (Elsa x402 API)
- Budget enforcement via `SpendTracker`
- CLI flags: `--real`, `--budget`, `--network`, `--yes`, `--balance`

Two PRD items blocked pending real execution:
- E2E-001: Real mode study completes
- E2E-002: Budget enforcement stops study correctly

## Tasks

### 1. Pre-flight Verification (PRE-001)
Verify environment before spending:
```bash
# Check wallet balance
npx tsx src/index.ts --balance --network=base

# Verify TypeScript compiles
npx tsc --noEmit
```

**Verification:**
- Wallet has >= $1.50 USDC (buffer for safety)
- EVM_PRIVATE_KEY in .env starts with `0x`
- No TypeScript errors

### 2. Minimal Payment Test (E2E-001) ~$0.064
Run smallest possible real study:
```bash
npx tsx src/index.ts --study --real --network=base --budget=0.10 --trials=1 --cycles=2
```

**Verification:**
- Study completes without errors
- Results JSON has `mockMode: false`
- Real data returned (not mock generators)
- Wallet balance decreased by ~$0.064

### 3. Budget Enforcement Test (E2E-002) ~$0.10
Verify budget stops study early:
```bash
npx tsx src/index.ts --study --real --network=base --budget=0.10 --trials=10 --cycles=50 --yes
```

**Verification:**
- Study stops before completing all trials
- Console shows "Budget exhausted" message
- Partial results saved
- Exit code is 0 (graceful, not error)

### 4. Documentation (DOC-001)
Update `progress.txt` with:
- Actual vs expected costs
- Any API quirks discovered
- Response format observations
- Mark E2E-001 and E2E-002 as `passes: true` in `prd-items.json`

## Critical Files
- `src/x402-client.ts` - RealX402Client.fetchEndpoint()
- `src/real-endpoints.ts` - Elsa endpoint URLs
- `src/study.ts` - Study runner
- `prd-items.json` - Update E2E items

## Success Criteria
- E2E-001 passes: Real payment made, real data returned
- E2E-002 passes: Budget enforcement stops study correctly
- Total spend <= $1 USDC

## Risk Mitigation
- Start with smallest tests first
- Monitor wallet balance between tests
- If endpoint errors occur, investigate before continuing
