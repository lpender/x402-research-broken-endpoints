// Statistical analysis functions for the scientific study

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((val) => (val - avg) ** 2);
  const variance = mean(squaredDiffs);
  return Math.sqrt(variance);
}

export function confidenceInterval(
  values: number[],
  confidence: number
): [number, number] {
  if (values.length === 0) return [0, 0];

  const avg = mean(values);
  const stdDev = standardDeviation(values);
  const n = values.length;

  // t-distribution critical value for 95% CI (approximation)
  // For small samples, use t-distribution; for large samples, converges to z-score
  const tCritical = getTCriticalValue(n, confidence);

  const marginOfError = tCritical * (stdDev / Math.sqrt(n));

  return [avg - marginOfError, avg + marginOfError];
}

function getTCriticalValue(n: number, confidence: number): number {
  // Simplified t-distribution table for common confidence levels
  // For 95% confidence interval
  if (confidence === 0.95) {
    if (n <= 5) return 2.776;
    if (n <= 10) return 2.228;
    if (n <= 20) return 2.086;
    if (n <= 30) return 2.042;
    return 1.96; // z-score for large samples
  }
  // For 99% confidence interval
  if (confidence === 0.99) {
    if (n <= 5) return 4.604;
    if (n <= 10) return 3.169;
    if (n <= 20) return 2.845;
    if (n <= 30) return 2.750;
    return 2.576; // z-score for large samples
  }
  return 1.96; // default to 95% CI z-score
}

export function tTest(
  group1: number[],
  group2: number[]
): { tStatistic: number; pValue: number } {
  if (group1.length === 0 || group2.length === 0) {
    return { tStatistic: 0, pValue: 1 };
  }

  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  // For paired samples (matched trials), use paired t-test
  if (n1 === n2) {
    const differences = group1.map((val, i) => val - group2[i]);
    const meanDiff = mean(differences);
    const stdDevDiff = standardDeviation(differences);

    if (stdDevDiff === 0) {
      return { tStatistic: 0, pValue: meanDiff === 0 ? 1 : 0 };
    }

    const tStatistic = meanDiff / (stdDevDiff / Math.sqrt(n1));

    // Approximate p-value from t-statistic
    const pValue = approximatePValue(Math.abs(tStatistic), n1 - 1);

    return { tStatistic, pValue };
  }

  // Independent samples t-test (fallback)
  const var1 = standardDeviation(group1) ** 2;
  const var2 = standardDeviation(group2) ** 2;
  const pooledStdDev = Math.sqrt(var1 / n1 + var2 / n2);

  if (pooledStdDev === 0) {
    return { tStatistic: 0, pValue: 1 };
  }

  const tStatistic = (mean1 - mean2) / pooledStdDev;
  const df = n1 + n2 - 2;
  const pValue = approximatePValue(Math.abs(tStatistic), df);

  return { tStatistic, pValue };
}

function approximatePValue(tStatistic: number, degreesOfFreedom: number): number {
  // Simplified p-value approximation based on t-statistic
  // This is a rough approximation; for production use a proper statistical library

  if (tStatistic < 1.96) return 0.05; // Not significant at α=0.05
  if (tStatistic < 2.576) return 0.01; // Significant at α=0.05
  if (tStatistic < 3.291) return 0.001; // Significant at α=0.01
  return 0.0001; // Highly significant
}

export function cohensD(group1: number[], group2: number[]): number {
  if (group1.length === 0 || group2.length === 0) return 0;

  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  const var1 = standardDeviation(group1) ** 2;
  const var2 = standardDeviation(group2) ** 2;

  // Pooled standard deviation
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const pooledStdDev = Math.sqrt(pooledVar);

  if (pooledStdDev === 0) return 0;

  return (mean1 - mean2) / pooledStdDev;
}

export function interpretEffectSize(
  d: number
): "negligible" | "small" | "medium" | "large" {
  const absD = Math.abs(d);
  if (absD < 0.2) return "negligible";
  if (absD < 0.5) return "small";
  if (absD < 0.8) return "medium";
  return "large";
}
