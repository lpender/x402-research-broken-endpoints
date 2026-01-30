# Rate limiting prevents fetching complete endpoint dataset for research

## Description

We're conducting research on x402 payment protocol adoption and need to analyze the full dataset of Base-compatible endpoints from the Bazaar API. However, strict rate limiting prevents us from fetching the complete dataset of 12,348 total endpoints.

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
  "limit": 1000,
  "offset": 0
}
```

**Important Discovery: Undocumented `limit` Maximum**

The API documentation does not specify a maximum value for the `limit` parameter. Through systematic testing, we discovered:
- ✅ `limit=1000`: Works (returns 1,000 items)
- ❌ `limit=1001+`: Fails (timeouts or returns 0 items)
- **Maximum supported: `limit=1000`**

Using the maximum limit significantly improves efficiency: only **13 pages** needed for 12,348 endpoints vs **124 pages** with default `limit=100`.

**Pagination Attempt (with limit=1000):**
- Page 1 (offset 0): ✅ Success (1,000 items)
- Page 2 (offset 1000): ✅ Success (1,000 items)
- Page 3 (offset 2000): ✅ Success (1,000 items)
- Page 4 (offset 3000): ✅ Success (1,000 items)
- Page 5 (offset 4000): ✅ Success after retries (1,000 items)
- Page 6 (offset 5000): ✅ Success (1,000 items)
- Page 7 (offset 6000): ✅ Success (1,000 items)
- Page 8 (offset 7000): ✅ Success (1,000 items)
- Page 9 (offset 8000): ❌ `429 Too Many Requests` (even after exponential backoff)

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

With `limit=1000` optimization, we can fetch **8,000 endpoints (65% of total)** before hitting rate limits. However:
- **Incomplete dataset**: Still missing 35% of endpoints (4,348 endpoints)
- **Research validity**: Cannot analyze the complete population
- **Statistical accuracy**: Results based on 65% sample may not represent full distribution
- **Unknown bias**: No way to know if remaining 35% differs significantly from fetched data

### Technical Details

**Our implementation:**
- GitHub: [link to your repo if public]
- Rate limiting strategy: 1s base delay + exponential backoff
- Use case: Academic research on x402 protocol adoption

**Observations:**
- The `network` filter appears to work server-side (all fetched endpoints matched Base)
- The `total: 12348` field represents global total across all networks (not filtered)
- With `limit=1000`, we fetch 8,000 endpoints → 496 DeFi-relevant endpoints (pool/whale/sentiment)
- Rate limit appears to be based on **request count** (not data size), so higher limits are more efficient
- Exponential backoff retries occasionally succeed, but eventually rate limit persists

### Proposed Solutions

1. **Document the `limit` parameter maximum** (discovered to be 1000 through testing)
2. **Increase rate limit** to allow ~13-15 pages per session (enough for complete dataset with `limit=1000`)
3. **Provide filtered totals** in response (e.g., "12,348 total, 2,456 match your filter")
4. **Add batch export** endpoint for research/analytics use cases
5. **Document rate limit policy** (requests per minute/hour, cooldown periods)

### Request

Could you either:
- Increase rate limits for legitimate research use cases, or
- Provide guidance on the correct pagination strategy to fetch complete datasets

Thank you for maintaining this valuable API for the x402 ecosystem!
