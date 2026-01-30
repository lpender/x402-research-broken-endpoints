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
