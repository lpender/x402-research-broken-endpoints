/**
 * Stage 2 Loader
 *
 * Loads Stage 1 endpoints.json for Stage 2 processing
 */

import type { EnrichedPrepaymentTestResult } from "./types.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Load endpoints from Stage 1 results folder
 */
export async function loadStage1Endpoints(
  stage1Path: string
): Promise<EnrichedPrepaymentTestResult[]> {
  const endpointsPath = path.join(stage1Path, 'endpoints.json');

  try {
    const json = await fs.readFile(endpointsPath, 'utf-8');
    const data = JSON.parse(json);

    // The endpoints.json structure has { endpoints: [...] }
    if (!data.endpoints || !Array.isArray(data.endpoints)) {
      throw new Error(`Invalid endpoints.json format: missing 'endpoints' array`);
    }

    return data.endpoints as EnrichedPrepaymentTestResult[];
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Stage 1 endpoints not found: ${endpointsPath}`);
    }
    throw error;
  }
}
