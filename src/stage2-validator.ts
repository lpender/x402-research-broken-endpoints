import type { SchemaValidationResult } from "./types.js";

/**
 * Stage 2 Response Schema Validator
 *
 * Validates diverse endpoint response formats using a hybrid approach:
 * 1. Try Bazaar schema first (if available)
 * 2. Fall back to pattern matching for common response structures
 */

/**
 * Validates response data against Bazaar schema or pattern matching
 */
export function validateResponse(
  response: any,
  bazaarSchema?: any,
  category?: string
): SchemaValidationResult {
  // Try Bazaar schema first
  if (bazaarSchema) {
    const bazaarResult = validateWithBazaarSchema(response, bazaarSchema);
    if (bazaarResult.valid) {
      return bazaarResult;
    }
  }

  // Fall back to pattern matching
  return validateWithPatternMatching(response, category);
}

/**
 * Validates response against Bazaar JSON Schema
 */
function validateWithBazaarSchema(
  response: any,
  schema: any
): SchemaValidationResult {
  try {
    // Basic JSON Schema validation (simplified)
    // In production, use a proper JSON Schema validator like Ajv

    if (!schema.type) {
      return {
        valid: false,
        data: [],
        error: "Invalid Bazaar schema: missing type",
        schemaUsed: 'none'
      };
    }

    // For now, just check if response is the expected type
    if (schema.type === 'object' && typeof response === 'object') {
      // Extract data array if schema defines it
      const dataKey = findDataKey(response);
      if (dataKey && Array.isArray(response[dataKey])) {
        return {
          valid: true,
          data: response[dataKey],
          schemaUsed: 'bazaar'
        };
      }
    }

    if (schema.type === 'array' && Array.isArray(response)) {
      return {
        valid: true,
        data: response,
        schemaUsed: 'bazaar'
      };
    }

    return {
      valid: false,
      data: [],
      error: "Response does not match Bazaar schema",
      schemaUsed: 'none'
    };
  } catch (error) {
    return {
      valid: false,
      data: [],
      error: `Bazaar schema validation error: ${error}`,
      schemaUsed: 'none'
    };
  }
}

/**
 * Validates response using common pattern matching
 * Priority order:
 * 1. { success: true, data: [...] }
 * 2. { data: [...] }
 * 3. [...] (direct array)
 * 4. { result: [...] }
 * 5. { response: { data: [...] } }
 */
function validateWithPatternMatching(
  response: any,
  category?: string
): SchemaValidationResult {
  try {
    // Null/undefined check
    if (response === null || response === undefined) {
      return {
        valid: false,
        data: [],
        error: "Response is null or undefined",
        schemaUsed: 'none'
      };
    }

    // Pattern 1: { success: true, data: [...] }
    if (
      typeof response === 'object' &&
      response.success === true &&
      Array.isArray(response.data)
    ) {
      return {
        valid: true,
        data: response.data,
        schemaUsed: 'pattern'
      };
    }

    // Pattern 2: { data: [...] }
    if (
      typeof response === 'object' &&
      Array.isArray(response.data)
    ) {
      return {
        valid: true,
        data: response.data,
        schemaUsed: 'pattern'
      };
    }

    // Pattern 3: [...] (direct array)
    if (Array.isArray(response)) {
      return {
        valid: true,
        data: response,
        schemaUsed: 'pattern'
      };
    }

    // Pattern 4: { result: [...] }
    if (
      typeof response === 'object' &&
      Array.isArray(response.result)
    ) {
      return {
        valid: true,
        data: response.result,
        schemaUsed: 'pattern'
      };
    }

    // Pattern 5: { response: { data: [...] } }
    if (
      typeof response === 'object' &&
      typeof response.response === 'object' &&
      Array.isArray(response.response.data)
    ) {
      return {
        valid: true,
        data: response.response.data,
        schemaUsed: 'pattern'
      };
    }

    // Pattern 6: Try to find any array in the response
    const dataKey = findDataKey(response);
    if (dataKey && Array.isArray(response[dataKey])) {
      return {
        valid: true,
        data: response[dataKey],
        schemaUsed: 'pattern'
      };
    }

    return {
      valid: false,
      data: [],
      error: "No recognized response pattern found",
      schemaUsed: 'none'
    };
  } catch (error) {
    return {
      valid: false,
      data: [],
      error: `Pattern matching error: ${error}`,
      schemaUsed: 'none'
    };
  }
}

/**
 * Finds a key in the response that contains an array of data
 * Common keys: data, result, results, items, entries, pools, whales, scores
 */
function findDataKey(response: any): string | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }

  const commonKeys = [
    'data',
    'result',
    'results',
    'items',
    'entries',
    'pools',
    'whales',
    'scores',
    'tokens',
    'transactions',
    'moves',
    'sentiment'
  ];

  for (const key of commonKeys) {
    if (Array.isArray(response[key])) {
      return key;
    }
  }

  return null;
}
