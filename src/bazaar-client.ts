/**
 * Bazaar Discovery Client
 *
 * Queries Coinbase's x402 Bazaar API to discover x402-enabled endpoints dynamically.
 * Implements in-memory TTL caching to minimize API calls.
 */

export interface BazaarPaymentRequirement {
  scheme: string;
  network?: string;
  asset?: string;
  amount?: string; // Payment amount in atomic units
  resource: string; // The actual endpoint URL
  description?: string; // Description of what the endpoint does
  payTo?: string;
  maxAmountRequired?: string;
  maxTimeoutSeconds?: number;
  mimeType?: string;
  extra?: any;
  outputSchema?: any;
}

export interface BazaarResource {
  type: string;
  accepts: BazaarPaymentRequirement[];
}

export interface BazaarResponse {
  items: BazaarResource[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
  // Legacy fields (may be removed by API in future)
  total?: number;
  limit?: number;
  offset?: number;
  x402Version?: number;
}

export interface BazaarQueryParams {
  url: string;
  type: string;
  network?: string;
  limit: number;
  offset: number;
}

interface CachedResponse {
  data: BazaarResponse;
  timestamp: number;
  queryParams: BazaarQueryParams;
}

export interface DiscoveryOptions {
  type?: string;
  network?: string;
  limit?: number;
  offset?: number;
  verbose?: boolean;
}

export class BazaarDiscoveryClient {
  private cache = new Map<string, CachedResponse>();
  private lastQueryParams?: BazaarQueryParams;

  constructor(
    private baseUrl: string,
    private cacheTtl: number = 3600000 // 1 hour default
  ) {}

  /**
   * Discover x402 resources from Bazaar with caching
   * Errors propagate to caller for proper error handling
   */
  async discoverResources(options: DiscoveryOptions = {}): Promise<BazaarResponse> {
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      console.log('[Bazaar] Cache hit');
      if (options.verbose) {
        this.logResponseStructure(cached.data, 'cached');
      }
      this.lastQueryParams = cached.queryParams;
      return cached.data;
    }

    const url = this.buildUrl(options);
    console.log(`[Bazaar] Querying: ${url}`);

    // Build query params object for tracking
    const queryParams: BazaarQueryParams = {
      url,
      type: options.type || 'http',
      network: options.network,
      limit: options.limit || 100,
      offset: options.offset || 0
    };
    this.lastQueryParams = queryParams;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bazaar API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as BazaarResponse;

    // Validate response structure
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid Bazaar response: missing items array');
    }

    // Debug logging if verbose enabled
    if (options.verbose) {
      this.logResponseStructure(data, 'fresh');
    }

    // Cache the result with query params
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      queryParams
    });

    console.log(`[Bazaar] Discovered ${data.items.length} resources`);
    return data;
  }

  /**
   * Fetch all pages from Bazaar API
   * Handles pagination automatically and returns concatenated results
   */
  async discoverAllResources(options: DiscoveryOptions = {}): Promise<BazaarResponse> {
    // Generate cache key for "all resources" query
    const cacheKey = this.getCacheKey({
      ...options,
      limit: 999999, // Special marker for "fetch all"
      offset: 0
    });

    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      console.log('[Bazaar] Cache hit for full dataset');
      this.lastQueryParams = cached.queryParams;
      return cached.data;
    }

    const allItems: BazaarResource[] = [];
    let offset = 0;
    const limit = options.limit || 100;
    let total: number | undefined;
    const delayMs = 1000; // 1 second delay between requests to avoid rate limiting
    const maxPages = 200; // Safety limit to prevent infinite loops
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    console.log('[Bazaar] Fetching all pages...');

    let pageCount = 0;
    while (pageCount < maxPages) {
      // Add delay between requests (skip on first request)
      if (offset > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      try {
        // Fetch current page
        const response = await this.discoverResources({
          ...options,
          limit,
          offset
        });

        // Reset error counter on success
        consecutiveErrors = 0;

        // Add items from this page
        allItems.push(...response.items);
        pageCount++;

        // Extract total from pagination object or legacy fields (only on first page)
        if (!total && pageCount === 1) {
          total = response.pagination?.total ?? response.total;
          if (total) {
            const estimatedPages = Math.ceil(total / limit);
            console.log(`[Bazaar] API reports ${total} total endpoints (estimated ${estimatedPages} pages)`);
            console.log(`[Bazaar] Note: Will fetch until no more results (API total may be unfiltered)`);
          }
        }

        // Stop if this page was empty or partial (last page)
        if (response.items.length === 0) {
          console.log(`[Bazaar] Reached end of results (empty page at offset ${offset})`);
          break;
        }

        if (response.items.length < limit) {
          console.log(`[Bazaar] Reached end of results (partial page: ${response.items.length}/${limit} items)`);
          break;
        }

        // Move to next page
        offset += limit;
        console.log(`[Bazaar] Fetched ${allItems.length} endpoints (page ${pageCount})...`);
      } catch (error: any) {
        consecutiveErrors++;

        // Check if it's a rate limit error
        const isRateLimit = error.message?.includes('429');

        if (isRateLimit && consecutiveErrors <= maxConsecutiveErrors) {
          // Exponential backoff for rate limits
          const backoffMs = delayMs * Math.pow(2, consecutiveErrors);
          console.log(`[Bazaar] Rate limit hit (attempt ${consecutiveErrors}/${maxConsecutiveErrors}), waiting ${backoffMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue; // Retry the same page
        }

        // If we hit too many errors or non-rate-limit error, return what we have
        if (allItems.length > 0) {
          console.log(`[Bazaar] Stopped after ${consecutiveErrors} consecutive errors: ${error.message}`);
          console.log(`[Bazaar] Returning ${allItems.length} endpoints fetched so far`);
          break;
        }
        throw error; // Re-throw if we haven't fetched anything yet
      }
    }

    if (pageCount >= maxPages) {
      console.log(`[Bazaar] Warning: Reached maximum page limit (${maxPages})`);
    }

    console.log(`[Bazaar] Pagination complete: ${allItems.length} total endpoints fetched`);

    // Build full response
    const fullResponse: BazaarResponse = {
      items: allItems,
      pagination: {
        total: allItems.length,
        limit,
        offset: 0
      }
    };

    // Cache the full result
    const queryParams: BazaarQueryParams = {
      url: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources',
      type: options.type || 'http',
      network: options.network,
      limit: allItems.length, // Actual count
      offset: 0
    };

    this.cache.set(cacheKey, {
      data: fullResponse,
      timestamp: Date.now(),
      queryParams
    });

    this.lastQueryParams = queryParams;
    return fullResponse;
  }

  /**
   * Get query parameters from last discoverResources() call
   */
  getLastQueryParams(): BazaarQueryParams | undefined {
    return this.lastQueryParams;
  }

  /**
   * Build query URL with parameters
   */
  private buildUrl(options: DiscoveryOptions): string {
    const params = new URLSearchParams();

    if (options.type) params.set('type', options.type);
    if (options.network) params.set('network', options.network);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    const queryString = params.toString();
    return `${this.baseUrl}/discovery/resources${queryString ? '?' + queryString : ''}`;
  }

  /**
   * Generate cache key from options
   */
  private getCacheKey(options: DiscoveryOptions): string {
    return JSON.stringify({
      type: options.type || 'all',
      network: options.network || 'all',
      limit: options.limit || 100,
      offset: options.offset || 0
    });
  }

  /**
   * Check if cached response is still valid
   */
  private isCacheValid(cached: CachedResponse): boolean {
    return Date.now() - cached.timestamp < this.cacheTtl;
  }

  /**
   * Clear all cached responses
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[Bazaar] Cache cleared');
  }

  /**
   * Log response structure for debugging
   */
  private logResponseStructure(data: BazaarResponse, source: 'fresh' | 'cached'): void {
    console.log(`\n[Bazaar Debug] Raw API response structure (${source}):`);
    console.log(`  Total items: ${data.total ?? '(not provided)'}`);
    console.log(`  Items returned: ${data.items.length}`);
    console.log(`  Limit: ${data.limit ?? '(not provided)'}, Offset: ${data.offset ?? '(not provided)'}`);

    // Show sample of first 3 items
    const sampleSize = Math.min(3, data.items.length);
    if (sampleSize > 0) {
      console.log(`  Sample of first ${sampleSize} item(s):`);
      for (let i = 0; i < sampleSize; i++) {
        const item = data.items[i];
        console.log(`    Item ${i + 1}:`);
        console.log(`      Type: ${item.type}`);
        console.log(`      Accepts (${item.accepts.length} payment option(s)):`);
        for (let j = 0; j < Math.min(1, item.accepts.length); j++) {
          const accept = item.accepts[j];
          console.log(`        [${j}] Resource: ${accept.resource}`);
          console.log(`            Description: ${accept.description?.substring(0, 100)}...`);
          console.log(`            Network: ${accept.network}, Asset: ${accept.asset}`);
          console.log(`            Scheme: ${accept.scheme}, PayTo: ${accept.payTo}`);
        }
      }
    }
    console.log('');
  }
}
