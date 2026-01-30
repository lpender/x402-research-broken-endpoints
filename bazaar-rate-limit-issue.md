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

**Option A** (Strongly Preferred): Server-side filtering via search/keyword parameters

Add query parameters to filter endpoints server-side:
```
?search=defi
?keywords=pool,yield,liquidity
?category=finance
?description_contains=swap
```

**Why this is better:**
- **Efficiency**: Currently fetching 8,000 endpoints to find 496 relevant ones (6% efficiency)
- **Bandwidth**: Reduces data transfer by 94%
- **Rate limits**: Fewer pages needed (1-2 pages vs 8+ pages)
- **User experience**: Results are immediately relevant
- **Scalability**: Works better as Bazaar grows (12K → 50K+ endpoints)

**Example use case:**
```bash
# Instead of fetching all 12,348 endpoints and filtering client-side:
GET /resources?type=http&network=eip155:8453&limit=1000
# Returns 8,000 endpoints, we discard 7,504 (94%)

# With server-side filtering:
GET /resources?type=http&network=eip155:8453&keywords=pool,yield,liquidity&limit=1000
# Returns only ~500 DeFi-relevant endpoints (100% efficiency)
```

**Option B**: Higher rate limits for research/batch queries
- Allow fetching ~13-15 pages per session (enough for complete dataset)
- Or provide a batch endpoint that returns more results per request

**Option C**: Clear documentation
- Document the `limit` parameter maximum (discovered to be 1000)
- Document exact rate limit policy (requests per minute/hour)
- Provide guidance on acceptable pagination strategies

**Option D**: Alternative access methods
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
- The `network` filter works server-side (all fetched endpoints matched Base) ✅
- The `total: 12348` field represents global total across all networks (not filtered)
- **No server-side filtering by description/category exists** ❌
  - Must fetch 8,000 endpoints to find 496 DeFi-relevant ones (6% efficiency)
  - 94% of fetched data is discarded after client-side filtering
  - Wastes bandwidth, rate limits, and processing time
- Rate limit appears to be based on **request count** (not data size), so higher limits are more efficient
- Exponential backoff retries occasionally succeed, but eventually rate limit persists

**Client-side filtering keywords used:**
- Pool: `['pool', 'yield', 'liquidity', 'vault', 'tvl', 'apy', 'lending', 'borrow']`
- Whale: `['whale', 'movement', 'wallet', 'tracker', 'flow', 'holder', 'transfer']`
- Sentiment: `['sentiment', 'analysis', 'price', 'signal', 'market', 'trend', 'indicator']`

These could be passed as query parameters instead: `?keywords=pool,yield,liquidity`

### Proposed Solutions

**Priority 1: Server-side filtering (solves root cause)**
1. **Add search/keyword query parameters** for filtering by description/category
   - Example: `?keywords=pool,yield,swap` or `?search=defi`
   - Reduces client-side filtering from 8,000 → 496 endpoints (6% efficiency)
   - Eliminates wasted bandwidth and rate limit consumption
   - Scales better as Bazaar grows beyond 12K endpoints

**Priority 2: Documentation improvements**
2. **Document the `limit` parameter maximum** (discovered to be 1000 through testing)
3. **Document rate limit policy** (requests per minute/hour, cooldown periods, thresholds)
4. **Provide filtered totals** in response (e.g., "12,348 total, 496 match filters")

**Priority 3: Rate limit adjustments (if server-side filtering not feasible)**
5. **Increase rate limit** to allow ~13-15 pages per session (enough for complete dataset with `limit=1000`)
6. **Add batch export** endpoint for research/analytics use cases

### Request

**Primary ask:** Add server-side filtering by keywords/description/category
- This solves the root cause (fetching irrelevant data)
- Improves efficiency from 6% to 100%
- Benefits all users, not just research use cases
- Makes the API more powerful and user-friendly

**Alternative:** If server-side filtering isn't feasible:
- Increase rate limits to allow fetching the complete dataset
- Document the `limit=1000` maximum and rate limit policies

**Context:**
We're conducting academic research on x402 protocol adoption and need to analyze DeFi-specific endpoints. Currently fetching 8,000 endpoints to find 496 relevant ones is inefficient and hits rate limits unnecessarily.

Thank you for maintaining this valuable API for the x402 ecosystem! Happy to discuss implementation details or provide more context on the use case.
