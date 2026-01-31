import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { config as loadEnv } from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';

loadEnv();

async function main() {
  const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
  });

  // USDC on Base
  const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  console.log('Wallet Address:', account.address);
  console.log('\nChecking recent USDC transfers from your wallet...\n');

  // Get Transfer events where your wallet is the sender
  const logs = await client.getLogs({
    address: usdcAddress,
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    args: {
      from: account.address
    },
    fromBlock: 41551000n, // Around the test transaction block
    toBlock: 'latest'
  });

  console.log(`Found ${logs.length} USDC transfers from your wallet since block 41551000:\n`);

  for (const log of logs) {
    const { from, to, value } = log.args as any;
    const block = await client.getBlock({ blockNumber: log.blockNumber! });
    const date = new Date(Number(block.timestamp) * 1000);
    console.log(`Block ${log.blockNumber}:`);
    console.log(`  Date: ${date.toISOString()}`);
    console.log(`  To: ${to}`);
    console.log(`  Amount: ${Number(value) / 1e6} USDC`);
    console.log(`  Tx: ${log.transactionHash}\n`);
  }
}

main();
