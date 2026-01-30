/**
 * Stage 1: 402 Prepayment Testing
 *
 * Tests endpoints to determine which ones respond with 402 status (prepayment required).
 * Uses raw HTTP fetch - NOT the x402 library - to check status codes.
 */

import type { PrepaymentTestResult } from './types.js';
import {
  parsePaymentRequiredHeader,
  findPrimaryUsdcPrice,
  summarizePaymentOptions
} from './payment-parser.js';

/**
 * Test a single endpoint to determine if it requires 402 prepayment.
 * Makes a raw HTTP GET request and checks the status code.
 *
 * @param url - The endpoint URL to test
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @returns Test result with status and headers
 */
export async function testPrepayment(
  url: string,
  timeoutMs: number = 5000
): Promise<PrepaymentTestResult> {
  const result: PrepaymentTestResult = {
    url,
    requires402: false,
    status: 0,
    headers: {},
  };

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Make raw HTTP request (no x402 payment)
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    // Capture status and headers
    result.status = response.status;
    result.headers = Object.fromEntries(response.headers.entries());

    // Check if endpoint requires prepayment
    result.requires402 = response.status === 402;

    // Parse payment-required header if 402 response
    if (result.requires402 && result.headers['payment-required']) {
      try {
        const paymentHeader = parsePaymentRequiredHeader(
          result.headers['payment-required']
        );

        if (paymentHeader) {
          result.paymentRequired = paymentHeader;
          result.requested402Price = findPrimaryUsdcPrice(paymentHeader.accepts);
          result.paymentOptions = summarizePaymentOptions(paymentHeader.accepts);
        } else {
          result.parseError = 'Failed to parse payment-required header';
        }
      } catch (error) {
        result.parseError = error instanceof Error ? error.message : String(error);
      }
    } else if (result.requires402 && !result.headers['payment-required']) {
      result.parseError = 'Missing payment-required header';
    }

  } catch (error) {
    // Handle timeout, network errors, etc.
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        result.error = `Timeout after ${timeoutMs}ms`;
      } else {
        result.error = error.message;
      }
    } else {
      result.error = String(error);
    }
    result.status = 0;
  }

  return result;
}

/**
 * Test multiple endpoints in parallel with concurrency control.
 *
 * @param urls - Array of endpoint URLs to test
 * @param concurrency - Maximum parallel requests (default: 5)
 * @param timeoutMs - Request timeout per endpoint (default: 5000)
 * @returns Array of test results
 */
export async function testPrepaymentBatch(
  urls: string[],
  concurrency: number = 5,
  timeoutMs: number = 5000
): Promise<PrepaymentTestResult[]> {
  const results: PrepaymentTestResult[] = [];

  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => testPrepayment(url, timeoutMs))
    );
    results.push(...batchResults);
  }

  return results;
}
