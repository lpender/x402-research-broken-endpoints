import type { Config, Endpoint } from "./config.js";
import type { PaymentResult } from "./x402-client.js";
import type { ZauthCheckResult } from "./zauth-client.js";
import {
  type PoolData,
  type WhaleMove,
  type SentimentScore,
  type Allocation,
  type OptimizationResult,
  type AggregatedData,
} from "./types.js";
import { queryEndpoint } from "./x402-client.js";
import { checkEndpointReliability } from "./zauth-client.js";
import { MOCK_ENDPOINTS } from "./endpoints.js";

type AgentMode = "no-zauth" | "with-zauth";

const RELIABILITY_THRESHOLD = 0.70;

export class YieldOptimizerAgent {
  private mode: AgentMode;
  private config: Config;
  private x402Client: any;
  private zauthClient: any;
  private totalSpent: number = 0;
  private totalBurn: number = 0;
  private zauthCost: number = 0;
  private queriesAttempted: number = 0;
  private queriesFailed: number = 0;

  constructor(
    mode: AgentMode,
    config: Config,
    x402Client: any,
    zauthClient?: any
  ) {
    this.mode = mode;
    this.config = config;
    this.x402Client = x402Client;
    this.zauthClient = zauthClient;
  }

  async runOptimizationCycle(): Promise<OptimizationResult> {
    // Reset cycle metrics
    this.totalSpent = 0;
    this.totalBurn = 0;
    this.zauthCost = 0;
    this.queriesAttempted = 0;
    this.queriesFailed = 0;

    // Fetch data from all sources
    const poolData = await this.fetchPoolData();
    const whaleData = await this.fetchWhaleActivity();
    const sentimentData = await this.fetchSentimentData();

    // Calculate optimal allocation
    const allocation = this.calculateOptimalAllocation({
      poolData,
      whaleData,
      sentimentData,
      dataQuality: this.calculateDataQuality(poolData, whaleData, sentimentData),
    });

    return {
      poolData,
      whaleData,
      sentimentData,
      allocation,
      totalSpent: this.totalSpent,
      totalBurn: this.totalBurn,
      zauthCost: this.zauthCost,
      queriesAttempted: this.queriesAttempted,
      queriesFailed: this.queriesFailed,
    };
  }

  async fetchPoolData(): Promise<PoolData[]> {
    const poolEndpoints = MOCK_ENDPOINTS.filter((e) =>
      e.url.includes("pools") || e.url.includes("whirlpools") || e.url.includes("vaults")
    );

    const results: PoolData[] = [];

    for (const endpoint of poolEndpoints) {
      const data = await this.queryWithOptionalZauth(endpoint);
      if (data && typeof data === "object" && "data" in data) {
        const responseData = (data as any).data;
        if (Array.isArray(responseData)) {
          // Convert mock data to PoolData format
          for (const pool of responseData) {
            results.push({
              poolId: pool.poolId,
              tokenA: pool.tokenA,
              tokenB: pool.tokenB,
              tvl: pool.tvl,
              apy: pool.apy,
              volume24h: pool.volume24h,
              feeRate: this.estimateFeeRate(pool.apy),
              impermanentLossRisk: this.assessILRisk(pool.tokenA, pool.tokenB),
            });
          }
        }
      }
    }

    return results;
  }

  async fetchWhaleActivity(): Promise<WhaleMove[]> {
    const whaleEndpoints = MOCK_ENDPOINTS.filter((e) =>
      e.url.includes("whale")
    );

    const results: WhaleMove[] = [];

    for (const endpoint of whaleEndpoints) {
      const data = await this.queryWithOptionalZauth(endpoint);
      if (data && typeof data === "object" && "data" in data) {
        const responseData = (data as any).data;
        if (Array.isArray(responseData)) {
          for (const whale of responseData) {
            results.push({
              wallet: whale.address,
              action: whale.action === "buy" || whale.action === "sell"
                ? whale.action
                : "transfer",
              token: whale.token,
              amount: whale.amount,
              timestamp: new Date(whale.timestamp),
              significance: this.calculateSignificance(whale.amount),
            });
          }
        }
      }
    }

    return results;
  }

  async fetchSentimentData(): Promise<SentimentScore[]> {
    const sentimentEndpoints = MOCK_ENDPOINTS.filter((e) =>
      e.url.includes("sentiment")
    );

    const results: SentimentScore[] = [];

    for (const endpoint of sentimentEndpoints) {
      const data = await this.queryWithOptionalZauth(endpoint);
      if (data && typeof data === "object" && "data" in data) {
        const responseData = (data as any).data;
        if (Array.isArray(responseData)) {
          for (const sentiment of responseData) {
            results.push({
              token: sentiment.token,
              score: sentiment.score,
              confidence: sentiment.confidence,
              sources: [endpoint.name],
            });
          }
        }
      }
    }

    return results;
  }

  calculateOptimalAllocation(data: AggregatedData): Allocation {
    if (data.poolData.length === 0) {
      return {
        poolId: "none",
        percentage: 0,
        reasoning: "No pool data available - cannot allocate",
      };
    }

    // Score each pool based on multiple factors
    const poolScores = data.poolData.map((pool) => {
      let score = 0;

      // Base score from APY (normalized to 0-1)
      score += (pool.apy / 50) * 0.4;

      // TVL score (higher TVL = lower risk)
      const tvlScore = Math.min(pool.tvl / 100_000_000, 1) * 0.2;
      score += tvlScore;

      // Volume score (higher volume = better liquidity)
      const volumeScore = Math.min(pool.volume24h / 10_000_000, 1) * 0.1;
      score += volumeScore;

      // IL risk penalty
      const ilPenalty = pool.impermanentLossRisk === "low" ? 0 :
                        pool.impermanentLossRisk === "medium" ? 0.1 : 0.2;
      score -= ilPenalty;

      // Whale activity boost
      const whaleActivity = data.whaleData.filter((w) =>
        w.token === pool.tokenA || w.token === pool.tokenB
      );
      const buySignal = whaleActivity.filter((w) => w.action === "buy")
        .reduce((sum, w) => sum + w.significance, 0);
      score += buySignal * 0.1;

      // Sentiment boost
      const tokenSentiment = data.sentimentData.filter((s) =>
        s.token === pool.tokenA || s.token === pool.tokenB
      );
      const avgSentiment = tokenSentiment.reduce((sum, s) =>
        sum + s.score * s.confidence, 0) / (tokenSentiment.length || 1);
      score += avgSentiment * 0.2;

      // Data quality penalty
      score *= data.dataQuality;

      return { pool, score };
    });

    // Select highest scoring pool
    poolScores.sort((a, b) => b.score - a.score);
    const best = poolScores[0];

    return {
      poolId: best.pool.poolId,
      percentage: 100,
      reasoning: `Selected ${best.pool.tokenA}-${best.pool.tokenB} (APY: ${best.pool.apy.toFixed(2)}%, TVL: $${(best.pool.tvl / 1_000_000).toFixed(2)}M, Score: ${best.score.toFixed(3)})`,
    };
  }

  private async queryWithOptionalZauth(endpoint: Endpoint): Promise<unknown | null> {
    this.queriesAttempted++;

    // Check reliability with Zauth if in with-zauth mode
    if (this.mode === "with-zauth" && this.zauthClient) {
      const zauthCheck: ZauthCheckResult = await checkEndpointReliability(
        this.zauthClient,
        endpoint
      );

      // Track zauth cost (mock: $0.001 per check)
      const zauthCheckCost = 0.001;
      this.zauthCost += zauthCheckCost;
      this.totalSpent += zauthCheckCost;

      // Skip if unreliable
      if (zauthCheck.shouldSkip) {
        if (this.config.verbose) {
          console.log(
            `[Zauth] Skipping ${endpoint.name}: ${zauthCheck.skipReason}`
          );
        }
        return null;
      }
    }

    // Query the endpoint
    const result: PaymentResult = await queryEndpoint(
      this.x402Client,
      endpoint,
      this.config
    );

    this.totalSpent += endpoint.priceUsdc;

    if (!result.success || !result.responseValid) {
      this.queriesFailed++;
      this.totalBurn += endpoint.priceUsdc;
      if (this.config.verbose) {
        console.log(
          `[Burn] ${endpoint.name} failed: ${result.error || "Invalid response"}`
        );
      }
      return null;
    }

    return result.response;
  }

  private calculateDataQuality(
    poolData: PoolData[],
    whaleData: WhaleMove[],
    sentimentData: SentimentScore[]
  ): number {
    // Each data source contributes 1/3 to quality
    const poolQuality = Math.min(poolData.length / 3, 1) * 0.33;
    const whaleQuality = Math.min(whaleData.length / 3, 1) * 0.33;
    const sentimentQuality = Math.min(sentimentData.length / 3, 1) * 0.34;

    return poolQuality + whaleQuality + sentimentQuality;
  }

  private estimateFeeRate(apy: number): number {
    // Rough heuristic: higher APY pools tend to have higher fees
    if (apy > 30) return 0.01; // 1%
    if (apy > 15) return 0.005; // 0.5%
    return 0.003; // 0.3%
  }

  private assessILRisk(tokenA: string, tokenB: string): "low" | "medium" | "high" {
    // Stablecoin pairs = low risk
    const stablecoins = ["USDC", "USDT", "DAI"];
    if (stablecoins.includes(tokenA) && stablecoins.includes(tokenB)) {
      return "low";
    }

    // One stablecoin = medium risk
    if (stablecoins.includes(tokenA) || stablecoins.includes(tokenB)) {
      return "medium";
    }

    // Both volatile = high risk
    return "high";
  }

  private calculateSignificance(amount: number): number {
    // Normalize to 0-1 based on amount (arbitrary scale)
    const maxWhaleAmount = 10_000_000;
    return Math.min(amount / maxWhaleAmount, 1);
  }
}
