import type { PoolData, WhaleMove, SentimentScore } from "./types.js";

/**
 * Stage 2 Field Mapping & Normalization
 *
 * Extracts data from diverse response structures and normalizes values
 */

/**
 * Default field mappings for each category
 * Each mapping is an array of possible field names (tried in order)
 */
const POOL_FIELD_MAPPINGS = {
  poolId: ['poolId', 'pool_id', 'pool', 'id', 'address', 'pairAddress'],
  tokenA: ['tokenA', 'token0', 'baseToken', 'base', 'token_a'],
  tokenB: ['tokenB', 'token1', 'quoteToken', 'quote', 'token_b'],
  tvl: ['tvl', 'totalValueLocked', 'liquidity', 'totalLiquidity'],
  tvlRaw: ['tvlRaw'], // For numeric TVL when main TVL is string
  apy: ['apy', 'apr.total', 'apr', 'yield', 'yieldRate', 'returns'],
  volume24h: ['volume24h', 'volume', 'dailyVolume', 'volume_24h'],
  feeRate: ['feeRate', 'fee', 'fees', 'fee_rate']
};

const WHALE_FIELD_MAPPINGS = {
  wallet: ['wallet', 'address', 'from', 'account', 'sender'],
  action: ['action', 'type', 'event', 'operation', 'kind'],
  token: ['token', 'asset', 'symbol', 'currency'],
  amount: ['amount', 'value', 'quantity', 'size'],
  timestamp: ['timestamp', 'time', 'date', 'created_at', 'createdAt']
};

const SENTIMENT_FIELD_MAPPINGS = {
  token: ['token', 'symbol', 'asset', 'currency', 'coin'],
  score: ['score', 'sentiment', 'rating', 'value'],
  confidence: ['confidence', 'weight', 'certainty', 'strength']
};

/**
 * Extracts pool data from raw response array
 */
export function extractPoolData(
  data: any[],
  customMapping?: any
): PoolData[] {
  const mapping = { ...POOL_FIELD_MAPPINGS, ...customMapping };
  const pools: PoolData[] = [];

  for (const item of data) {
    try {
      let poolId = extractField(item, mapping.poolId);
      let tokenA = extractField(item, mapping.tokenA);
      let tokenB = extractField(item, mapping.tokenB);

      // If pool name contains tokens (e.g., "AVNT-USDC"), split it
      if (poolId && !tokenA && !tokenB && typeof poolId === 'string') {
        const tokens = splitPoolName(poolId);
        if (tokens) {
          tokenA = tokens.tokenA;
          tokenB = tokens.tokenB;
        }
      }

      // Try to extract TVL (prefer numeric tvlRaw over string tvl)
      let tvl = normalizeNumericField(extractField(item, mapping.tvlRaw), 'raw');
      if (!tvl) {
        const tvlStr = extractField(item, mapping.tvl);
        tvl = parseCurrencyString(tvlStr);
      }

      // Extract APY (handle nested apr.total)
      const apyRaw = extractNestedField(item, mapping.apy);
      const apy = parsePercentageString(apyRaw);

      const volume24h = normalizeNumericField(extractField(item, mapping.volume24h), 'raw');
      const feeRate = normalizeNumericField(extractField(item, mapping.feeRate), 'percentage');

      // Require at minimum: poolId, tokenA, tokenB
      if (!poolId || !tokenA || !tokenB) {
        continue;
      }

      // Estimate impermanent loss risk based on pool characteristics
      const impermanentLossRisk = estimateImpermanentLossRisk(tvl, volume24h);

      pools.push({
        poolId,
        tokenA,
        tokenB,
        tvl: tvl || 0,
        apy: apy || 0,
        volume24h: volume24h || 0,
        feeRate: feeRate || 0.003, // Default to 0.3%
        impermanentLossRisk
      });
    } catch (error) {
      // Skip malformed items
      continue;
    }
  }

  return pools;
}

/**
 * Extracts whale move data from raw response array
 */
export function extractWhaleData(
  data: any[],
  customMapping?: any
): WhaleMove[] {
  const mapping = { ...WHALE_FIELD_MAPPINGS, ...customMapping };
  const moves: WhaleMove[] = [];

  for (const item of data) {
    try {
      const wallet = extractField(item, mapping.wallet);
      const actionStr = extractField(item, mapping.action);
      const token = extractField(item, mapping.token);
      const amount = normalizeNumericField(extractField(item, mapping.amount), 'raw');
      const timestampRaw = extractField(item, mapping.timestamp);

      // Require at minimum: wallet, action, token
      if (!wallet || !actionStr || !token) {
        continue;
      }

      // Normalize action to expected type
      const action = normalizeAction(actionStr);

      // Parse timestamp
      const timestamp = parseTimestamp(timestampRaw);

      // Estimate significance (0-1 score based on amount)
      const significance = estimateSignificance(amount);

      moves.push({
        wallet,
        action,
        token,
        amount: amount || 0,
        timestamp,
        significance
      });
    } catch (error) {
      // Skip malformed items
      continue;
    }
  }

  return moves;
}

/**
 * Extracts sentiment data from raw response array
 */
export function extractSentimentData(
  data: any[],
  customMapping?: any
): SentimentScore[] {
  const mapping = { ...SENTIMENT_FIELD_MAPPINGS, ...customMapping };
  const scores: SentimentScore[] = [];

  for (const item of data) {
    try {
      const token = extractField(item, mapping.token);
      const score = normalizeNumericField(extractField(item, mapping.score), 'sentiment');
      const confidence = normalizeNumericField(extractField(item, mapping.confidence), 'probability');

      // Require at minimum: token, score
      if (!token || score === null) {
        continue;
      }

      scores.push({
        token,
        score: score || 0,
        confidence: confidence || 0.5,
        sources: [] // Not tracked in basic extraction
      });
    } catch (error) {
      // Skip malformed items
      continue;
    }
  }

  return scores;
}

/**
 * Extracts a field from an item using multiple possible field names
 * Supports nested fields like "apr.total"
 */
function extractField(item: any, fieldNames: string[]): any {
  for (const name of fieldNames) {
    // Handle nested fields (e.g., "apr.total")
    if (name.includes('.')) {
      const value = extractNestedField(item, [name]);
      if (value !== null) {
        return value;
      }
    } else {
      if (item[name] !== undefined && item[name] !== null) {
        return item[name];
      }
    }
  }
  return null;
}

/**
 * Extracts nested field like "apr.total" from object
 */
function extractNestedField(item: any, fieldNames: string[]): any {
  for (const name of fieldNames) {
    if (!name.includes('.')) {
      if (item[name] !== undefined && item[name] !== null) {
        return item[name];
      }
      continue;
    }

    const parts = name.split('.');
    let value = item;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        value = null;
        break;
      }
    }

    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

/**
 * Normalizes numeric fields with type-specific handling
 */
function normalizeNumericField(
  value: any,
  expectedUnit: 'raw' | 'percentage' | 'probability' | 'sentiment'
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  // Parse string numbers
  let numValue: number;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
  } else if (typeof value === 'number') {
    numValue = value;
  } else {
    return null;
  }

  // Check for NaN
  if (isNaN(numValue)) {
    return null;
  }

  // Normalize based on expected unit
  switch (expectedUnit) {
    case 'percentage':
      // APY > 10 assumed to be in percentage form (50 → 0.50)
      if (numValue > 10) {
        return numValue / 100;
      }
      return numValue;

    case 'probability':
      // Confidence > 1 assumed to be percentage (85 → 0.85)
      if (numValue > 1) {
        return numValue / 100;
      }
      return numValue;

    case 'sentiment':
      // Sentiment scores can vary (-100 to 100, -1 to 1, 0 to 100)
      // Normalize to -1 to 1 range
      if (numValue >= -1 && numValue <= 1) {
        return numValue;
      }
      if (numValue >= -100 && numValue <= 100) {
        return numValue / 100;
      }
      // Unknown range, clamp to -1 to 1
      return Math.max(-1, Math.min(1, numValue / 100));

    case 'raw':
    default:
      return numValue;
  }
}

/**
 * Normalizes action strings to expected type
 */
function normalizeAction(action: string): "buy" | "sell" | "transfer" {
  const normalized = action.toLowerCase();

  if (normalized.includes('buy') || normalized.includes('purchase')) {
    return 'buy';
  }
  if (normalized.includes('sell') || normalized.includes('sold')) {
    return 'sell';
  }
  return 'transfer';
}

/**
 * Parses timestamp from various formats
 */
function parseTimestamp(value: any): Date {
  if (!value) {
    return new Date();
  }

  // Already a Date
  if (value instanceof Date) {
    return value;
  }

  // Unix timestamp (seconds or milliseconds)
  if (typeof value === 'number') {
    // Assume seconds if less than year 3000 in milliseconds
    if (value < 32503680000) {
      return new Date(value * 1000);
    }
    return new Date(value);
  }

  // ISO string
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

/**
 * Estimates impermanent loss risk based on pool characteristics
 */
function estimateImpermanentLossRisk(
  tvl: number | null,
  volume24h: number | null
): "low" | "medium" | "high" {
  // Simple heuristic: high volume relative to TVL = more volatile = higher IL risk
  if (!tvl || !volume24h || tvl === 0) {
    return 'medium';
  }

  const volumeToTvlRatio = volume24h / tvl;

  if (volumeToTvlRatio < 0.1) {
    return 'low';
  }
  if (volumeToTvlRatio < 0.5) {
    return 'medium';
  }
  return 'high';
}

/**
 * Estimates significance of a whale move based on amount
 */
function estimateSignificance(amount: number | null): number {
  if (!amount) {
    return 0.5;
  }

  // Simple heuristic: log scale from 0 to 1
  // $10k = 0.5, $100k = 0.7, $1M = 0.9, $10M+ = 1.0
  const logAmount = Math.log10(Math.max(1, amount));
  const significance = Math.min(1, logAmount / 7); // log10(10M) ≈ 7

  return Math.max(0, Math.min(1, significance));
}

/**
 * Parses currency strings like "$1.13M", "$148.60B", "$1,234.56" into numbers
 */
function parseCurrencyString(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  // Remove $ sign and commas
  let cleaned = value.replace(/[$,]/g, '');

  // Handle suffixes (K, M, B, T)
  const multipliers: { [key: string]: number } = {
    'K': 1_000,
    'M': 1_000_000,
    'B': 1_000_000_000,
    'T': 1_000_000_000_000
  };

  let multiplier = 1;
  const lastChar = cleaned.slice(-1).toUpperCase();
  if (multipliers[lastChar]) {
    multiplier = multipliers[lastChar];
    cleaned = cleaned.slice(0, -1);
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return null;
  }

  return num * multiplier;
}

/**
 * Parses percentage strings like "461398.90%", "1.63%" into decimal numbers
 */
function parsePercentageString(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    // If already a number, assume it's either decimal (0.05) or percentage (5)
    // Use the existing normalization logic
    return normalizeNumericField(value, 'percentage');
  }

  if (typeof value !== 'string') {
    return null;
  }

  // Remove % sign
  const cleaned = value.replace(/%/g, '');
  const num = parseFloat(cleaned);

  if (isNaN(num)) {
    return null;
  }

  // Convert percentage to decimal (5% → 0.05)
  return num / 100;
}

/**
 * Splits pool name like "AVNT-USDC" into tokenA and tokenB
 * Handles separators: -, /, _
 */
function splitPoolName(poolName: string): { tokenA: string; tokenB: string } | null {
  if (typeof poolName !== 'string') {
    return null;
  }

  // Try common separators
  const separators = ['-', '/', '_', ' '];

  for (const sep of separators) {
    if (poolName.includes(sep)) {
      const parts = poolName.split(sep);
      if (parts.length >= 2) {
        return {
          tokenA: parts[0].trim(),
          tokenB: parts[1].trim()
        };
      }
    }
  }

  return null;
}
