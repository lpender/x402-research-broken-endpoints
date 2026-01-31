# Payment timeout race condition on Base network - facilitator timeout shorter than block confirmation time

## Description

The @x402 payment protocol has a fundamental race condition on Base network that causes 100% payment failures despite correct client implementation. Users pay for requests (~$0.002 each) but receive no data because payments succeed on-chain after the facilitator has already timed out.

**Impact:** All paid requests fail. Wallets are debited but endpoints reject requests.

## Root Cause

**Facilitator timeout (5-10s) < Base confirmation time (10-28s)**

The facilitator gives up waiting for transaction confirmation before the Base network confirms the transaction. By the time the payment succeeds on-chain, the facilitator has already returned a 402 error to the endpoint.

## Evidence

### Transaction that succeeded on-chain but was rejected
```
Transaction: 0x8e01aace01ced4155b30d636b547727becdbb8a700f9b7f54ed02c4d629ae696
Block: 41551053
Status: SUCCESS ✅
Amount: 0.002 USDC
Wallet: DEBITED ❌
Data received: NONE ❌
```

### Error from facilitator
```json
{
  "error": "Settlement failed",
  "details": "Facilitator settle failed (500): {
    \"errorMessage\": \"transaction did not confirm in time: context deadline exceeded\",
    \"errorReason\": \"settle_exact_node_failure\",
    \"network\": \"eip155:8453\",
    \"transaction\": \"0x8e01aace01ced4155b30d636b547727becdbb8a700f9b7f54ed02c4d629ae696\"
  }"
}
```

### Timing breakdown
| Event | Time |
|-------|------|
| Client sends payment intent | T+0s |
| Facilitator submits transaction | T+1s |
| **Facilitator timeout & gives up** | **T+5-10s** ⏱️ |
| Transaction confirms on-chain | T+10-28s ✅ |
| **Gap (payment succeeds after timeout)** | **0-18s** |

## Why this can't be fixed client-side

1. **Gas price is controlled by facilitator** - Client only signs EIP-712 payment intent, facilitator creates and submits the actual transaction
2. **No timeout configuration available** - `@x402/fetch` library has no options for gas price, timeout, or confirmation speed
3. **No retry/reconciliation mechanism** - Once facilitator times out, there's no way to reconcile late confirmations

## Proposed solutions

### 1. Increase facilitator timeout to 60s
- Base network needs 10-28s for confirmation
- Current ~10s timeout is insufficient
- 60s timeout would accommodate network variance

### 2. Implement confirmation polling
- Don't immediately fail on timeout
- Poll on-chain to check if transaction confirmed
- Retry settlement if payment found on-chain

### 3. Add reconciliation webhook
- For payments that confirm late
- Allow client to prove payment succeeded
- Retry data delivery without new payment

## Workaround

Switch to Solana network where confirmation time (<1s) is well within facilitator timeout window.

## Additional context

- **Network:** Base (eip155:8453)
- **Client library:** `@x402/fetch`
- **Facilitator:** `0x8f5cb67b49555e614892b7233cfddebfb746e531`
- **Test wallet:** Multiple confirmed payments, all rejected
- **Full analysis:** See 402-payment-timeout-analysis.md
