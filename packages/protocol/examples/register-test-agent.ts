import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { AgencCoordination } from '../src/generated/agenc_coordination';
import idl from '../src/generated/agenc_coordination.json';
import * as fs from 'fs';
import * as crypto from 'crypto';

const config = JSON.parse(fs.readFileSync('/home/sustainableabundance/.agenc/config.json', 'utf8'));
const connection = new Connection(config.connection.rpcUrl);
const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('/home/sustainableabundance/.config/solana/id.json', 'utf8')));
const keypair = Keypair.fromSecretKey(secretKey);
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: async (tx: any) => {
    tx.sign(keypair);
    return tx;
  },
  signAllTransactions: async (txs: any[]) => {
    txs.forEach(tx => tx.sign(keypair));
    return txs;
  },
};
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program<AgencCoordination>(idl as AgencCoordination, provider);

async function register() {
  const agentIdU8 = new Uint8Array(crypto.randomBytes(32));
  const agentId = Array.from(agentIdU8);
  const capabilities = new BN(15)
  // ["web", "infra for modern web", "typescript-migration", "playwright-e2e", "agenc"]
  // new BN(15); // bitmask for 4 capabilities, adjust as needed
  const endpoint = "https://example.com";
  const metadataUri = "https://github.com/p10ns11y";
  const stakeAmount = new BN(100000000); // 0.1 SOL

  const tx = await program.methods
    .registerAgent(
      agentId,
      capabilities,
      endpoint,
      metadataUri,
      stakeAmount
    )
    .rpc();

  console.log("Agent registered! Tx:", tx);
  console.log("View: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
}

register();