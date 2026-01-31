/**
 * Stage 2 Loader
 *
 * Loads Stage 1 endpoints.json for Stage 2 processing
 */

import type { EnrichedPrepaymentTestResult } from "./types.js";
import type { Network } from "./config.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Detect network from Stage 1 folder name
 * Format: YYYY-MM-DDTHH-MM-SS_stage1_{network}
 */
export function detectNetworkFromPath(stage1Path: string): Network {
  const folderName = path.basename(stage1Path);

  if (folderName.endsWith('_stage1_base')) {
    return 'base';
  }
  if (folderName.endsWith('_stage1_solana')) {
    return 'solana';
  }

  throw new Error(
    `Cannot detect network from Stage 1 path: ${stage1Path}\n` +
    `Expected folder name ending with '_stage1_base' or '_stage1_solana'`
  );
}

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
