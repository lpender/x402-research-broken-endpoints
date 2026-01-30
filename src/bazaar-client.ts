/**
 * Bazaar Discovery Client
 *
 * Queries Coinbase's x402 Bazaar API to discover x402-enabled endpoints dynamically.
 * Implements in-memory TTL caching to minimize API calls.
 */

export interface BazaarPaymentRequirement {
  scheme: string;
  network?: string;
  amount?: string;
  asset?: string;
}

export interface BazaarResource {
  id: string;
  type: string;
  url: string;
  metadata?: {
    name?: string;
    description?: string;
    category?: string;
    [key: string]: any;
  };
  accepts?: BazaarPaymentRequirement[];
}

export interface BazaarResponse {
  items: BazaarResource[];
  total: number;
  limit: number;
  offset: number;
}

interface CachedResponse {
  data: BazaarResponse;
  timestamp: number;
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

  constructor(
    private baseUrl: string,
    private cacheTtl: number = 3600000 // 1 hour default
  ) {}

  /**
   * Discover x402 resources from Bazaar with caching
   */
  async discoverResources(options: DiscoveryOptions = {}): Promise<BazaarResponse> {
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      console.log('[Bazaar] Cache hit');
      return cached.data;
    }

    try {
      const url = this.buildUrl(options);
      console.log(`[Bazaar] Querying: ${url}`);

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
        console.log('\n[Bazaar Debug] Raw API response structure:');
        console.log(`  Total items: ${data.total}`);
        console.log(`  Items returned: ${data.items.length}`);
        console.log(`  Limit: ${data.limit}, Offset: ${data.offset}`);

        // Show sample of first 3 items
        const sampleSize = Math.min(3, data.items.length);
        if (sampleSize > 0) {
          console.log(`  Sample of first ${sampleSize} item(s):`);
          for (let i = 0; i < sampleSize; i++) {
            const item = data.items[i];
            console.log(`    Item ${i + 1}:`);
            console.log(`      ID: ${item.id}`);
            console.log(`      Type: ${item.type}`);
            console.log(`      URL: ${item.url}`);
            console.log(`      Metadata: ${JSON.stringify(item.metadata || {}, null, 2).split('\n').join('\n      ')}`);
            console.log(`      Accepts: ${JSON.stringify(item.accepts || [], null, 2).split('\n').join('\n      ')}`);
          }
        }
        console.log('');
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      console.log(`[Bazaar] Discovered ${data.items.length} resources (total: ${data.total})`);
      return data;

    } catch (error) {
      console.warn(`[Bazaar] Discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      // Return empty result on error - caller will fallback to static registry
      return { items: [], total: 0, limit: options.limit || 100, offset: options.offset || 0 };
    }
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
}
