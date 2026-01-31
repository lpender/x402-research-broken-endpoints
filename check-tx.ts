import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { config as loadEnv } from 'dotenv';

loadEnv();

async function main() {
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
  });

  const txHash = '0x8e01aace01ced4155b30d636b547727becdbb8a700f9b7f54ed02c4d629ae696';

  try {
    console.log('Checking transaction:', txHash);
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    console.log('\nTransaction found:');
    console.log('  Block:', tx.blockNumber);
    console.log('  From:', tx.from);
    console.log('  To:', tx.to);
    console.log('  Value:', tx.value);
    console.log('  Gas:', tx.gas);

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    console.log('\nReceipt:');
    console.log('  Status:', receipt.status === 'success' ? 'SUCCESS' : 'FAILED');
    console.log('  Block:', receipt.blockNumber);
    console.log('  Gas used:', receipt.gasUsed);
  } catch (error) {
    console.log('\nTransaction not found or error:', error);
  }
}

main();
