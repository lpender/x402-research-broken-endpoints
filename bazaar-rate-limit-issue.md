# Rate limiting prevents fetching complete endpoint dataset for research

## Description

We're conducting research on x402 payment protocol adoption and need to analyze the full dataset of Base-compatible endpoints from the Bazaar API. However, strict rate limiting prevents us from fetching more than 4 pages (~400 endpoints) out of the reported 12,348 total endpoints.

### Use Case
Scientific study measuring:
- Percentage of endpoints implementing 402 prepayment protocol
- Category distribution (DeFi pool/whale/sentiment endpoints)
- Network-specific endpoint availability

For statistically valid results, we need to analyze the complete population rather than a small sample.

### Current Behavior

**API Endpoint:**
```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
```

**Parameters:**
```json
{
  "type": "http",
  "network": "eip155:8453",
  "limit": 100,
  "offset": 0
}
```

**Pagination Attempt:**
- Page 1 (offset 0): ✅ Success (100 items)
- Page 2 (offset 100): ✅ Success (100 items)
- Page 3 (offset 200): ✅ Success (100 items)
- Page 4 (offset 400): ✅ Success (100 items)
- Page 5 (offset 400): ❌ `429 Too Many Requests`

**Mitigation attempts (all failed):**
- 1 second delay between requests
- Exponential backoff (2s, 4s, 8s delays)
- 3 retry attempts per page

After page 4, the rate limit becomes impossible to bypass even with long delays.

### Expected Behavior

**Option A** (Preferred): Higher rate limits for research/batch queries
- Allow fetching ~10-20 pages before rate limiting
- Or provide a batch endpoint that returns more results per request

**Option B**: Clear documentation of rate limits
- Document exact rate limit policy (requests per minute/hour)
- Provide guidance on acceptable pagination strategies
- Suggest optimal delay between requests

**Option C**: Alternative access method
- Bulk data export API for research purposes
- Webhook/stream for endpoint updates

### Impact

Current limitation affects:
- **Sample bias**: 400 endpoints is only 3% of total, may not be representative
- **Research validity**: Statistical analysis requires larger samples
- **Completeness**: Cannot determine true percentage of 402 adoption
- **Network filtering**: Unknown if more Base endpoints exist beyond offset 400

### Technical Details

**Our implementation:**
- GitHub: [link to your repo if public]
- Rate limiting strategy: 1s base delay + exponential backoff
- Use case: Academic research on x402 protocol adoption

**Observations:**
- The `network` filter appears to work server-side (all 400 fetched endpoints matched Base)
- The `total: 12348` field seems to represent global total, not filtered total
- 400 endpoints filtered to 45 DeFi-relevant endpoints (pool/whale/sentiment categories)

### Proposed Solutions

1. **Increase rate limit** to allow 10-20 pages per session
2. **Increase page size** from max 100 to 500 or 1000 items per request
3. **Provide filtered totals** in response (e.g., "12,348 total, 2,456 match your filter")
4. **Add batch export** endpoint for research/analytics use cases
5. **Document current limits** so developers know what to expect

### Request

Could you either:
- Increase rate limits for legitimate research use cases, or
- Provide guidance on the correct pagination strategy to fetch complete datasets

Thank you for maintaining this valuable API for the x402 ecosystem!
