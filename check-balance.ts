import { config as loadEnv } from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';

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

  // Get ETH balance
  const ethBalance = await client.getBalance({ address: account.address });
  console.log('ETH Balance:', formatUnits(ethBalance, 18), 'ETH');

  // Get USDC balance
  const usdcBalance = await client.readContract({
    address: usdcAddress,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'uint256' }]
    }],
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log('USDC Balance:', formatUnits(usdcBalance as bigint, 6), 'USDC');
}

main();
