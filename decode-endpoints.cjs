#!/usr/bin/env node
/**
 * Decode payment-required headers in endpoints.json
 * Reads latest results folder and outputs endpoints_decoded.json
 */

const fs = require('fs');
const path = require('path');

// Find latest results folder
const resultsDir = './results';
const folders = fs.readdirSync(resultsDir)
  .filter(f => f.startsWith('2026-'))
  .sort()
  .reverse();

if (folders.length === 0) {
  console.error('No results folders found');
  process.exit(1);
}

const latestFolder = path.join(resultsDir, folders[0]);
const inputPath = path.join(latestFolder, 'endpoints.json');
const outputPath = path.join(latestFolder, 'endpoints_decoded.json');

console.log(`Reading: ${inputPath}`);

// Read endpoints.json
const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// Decode payment-required headers
data.endpoints = data.endpoints.map(endpoint => {
  if (endpoint.headers && endpoint.headers['payment-required']) {
    try {
      // Decode Base64
      const base64 = endpoint.headers['payment-required'];
      const jsonString = Buffer.from(base64, 'base64').toString('utf-8');
      const decoded = JSON.parse(jsonString);

      // Add decoded structure
      endpoint.paymentRequired = decoded;

      // Remove the Base64 encoded version to save space
      delete endpoint.headers['payment-required'];
    } catch (error) {
      endpoint.paymentRequired = { error: 'Failed to decode: ' + error.message };
    }
  }
  return endpoint;
});

// Write output
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`✓ Decoded ${data.endpoints.length} endpoints`);
console.log(`✓ Written to: ${outputPath}`);
