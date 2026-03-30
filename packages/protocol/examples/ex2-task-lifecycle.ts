// agenc-core-flow.ts
// SAVE THIS EXACT CODE AS agenc-core-flow.ts (delete or rename your old ex2-task-lifecycle.ts)
// ONE-LINER INSTALL (run once if not done):
// npm install @coral-xyz/anchor@^0.32.1 @solana/web3.js zod

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { AgencCoordination } from '../src/generated/agenc_coordination';
import idl from '../src/generated/agenc_coordination.json';
import { z } from 'zod';
import * as fs from 'fs/promises';

const KEYPAIR_PATH = '/home/sustainableabundance/.config/solana/id.json';
const PROGRAM_ID = new PublicKey('6UcJzbTEemBz3aY5wK5qKHGMD7bdRsmR4smND29gB2ab');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

const walletSchema = z.object({ publicKey: z.instanceof(PublicKey) });
const taskSchema = z.object({
  description: z.string().min(1),
  rewardLamports: z.number().positive(),
  taskId: z.number().int().positive(),
});
const bidSchema = z.object({ bidLamports: z.number().positive() });

async function loadWallet() {
  const secretKey = new Uint8Array(JSON.parse(await fs.readFile(KEYPAIR_PATH, 'utf8')));
  const keypair = Keypair.fromSecretKey(secretKey);
  const EXPECTED_PUBKEY = '4DpZ5ijAuMWxvgwfim7xKDb4CfcqGKtM1UyJnrsBBfpv';
  if (keypair.publicKey.toBase58() !== EXPECTED_PUBKEY) {
    throw new Error(`Keypair pubkey ${keypair.publicKey.toBase58()} does not match expected ${EXPECTED_PUBKEY}. Fund ~0.01 SOL on devnet.`);
  }
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => { tx.sign(keypair); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.sign(keypair)); return txs; },
  };
  console.log(`✅ Wallet loaded: ${keypair.publicKey.toBase58()}`);
  return walletSchema.parse(wallet);
}

async function main() {
  const wallet = await loadWallet();
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program<AgencCoordination>(idl as any, provider);

  // Fixed agent_id from ex1 (run it first!)
  const agentId = Buffer.alloc(32, 1);
  const [creatorAgentPda] = PublicKey.findProgramAddressSync([Buffer.from('agent'), agentId], program.programId);

  const agentInfo = await connection.getAccountInfo(creatorAgentPda);
  if (!agentInfo) throw new Error(`❌ creator_agent PDA not found! Run ex1-register-test-agent.ts first. PDA: ${creatorAgentPda.toBase58()}`);

  const [protocolConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('protocol')], program.programId);
  const [authorityRateLimitPda] = PublicKey.findProgramAddressSync([Buffer.from('authority_rate_limit'), wallet.publicKey.toBuffer()], program.programId);

  const taskInput = taskSchema.parse({
    description: "Dummy test task for flow learning",
    rewardLamports: 1000000,
    taskId: 123,
  });

  const taskIdBytes = Buffer.alloc(32);
  taskIdBytes.writeUInt32LE(taskInput.taskId, 0);
  const [taskPda] = PublicKey.findProgramAddressSync([Buffer.from('task'), wallet.publicKey.toBuffer(), taskIdBytes], program.programId);
  const [escrowPda] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), taskPda.toBuffer()], program.programId);

  const descriptionBytes = Buffer.alloc(64);
  Buffer.from(taskInput.description).copy(descriptionBytes);

  console.log('\n🧑‍💼 1. CREATE TASK');
  console.log('What: Creator registers task + locks SOL in escrow PDA. Marketplace listing created.');
  console.log('PDAs changed: task, escrow, creator_agent (verified on-chain). Escrow: SOL moves from creator → escrow PDA.');
  console.log('Why this step exists: Core marketplace entry point — prevents spam tasks.');
  // Why this matters: Like the Zod validation library you shipped at Oneflow, we catch bad data early.

  const createTaskAccounts = {
    task: taskPda,
    escrow: escrowPda,
    protocol_config: protocolConfigPda,
    creator_agent: creatorAgentPda,
    authority_rate_limit: authorityRateLimitPda,
    authority: wallet.publicKey,
    creator: wallet.publicKey,
    system_program: SystemProgram.programId,
  };

  const tx1 = await program.methods
    .createTask(
      taskIdBytes,
      new BN(0),
      descriptionBytes,
      new BN(taskInput.rewardLamports),
      1,
      new BN(0),
      0,
      null
    )
    .accountsStrict(createTaskAccounts)
    .rpc({ preflightCommitment: 'confirmed' });
  console.log(`✅ Tx1: https://explorer.solana.com/tx/${tx1}?cluster=devnet`);

  const bidInput = bidSchema.parse({ bidLamports: 500000 });

  console.log('\n💰 2. PLACE BID');
  console.log('What: Bidder signals interest. Bid book updated, escrow ready for claim.');
  console.log('PDAs: bid, bidder_market_state. Escrow: no move yet.');
  console.log('Why this step exists: Enables competitive marketplace.');

  const bidAccounts = {
    task: taskPda,
    bidder: creatorAgentPda,
    payer: wallet.publicKey,
    system_program: SystemProgram.programId,
  };

  const tx2 = await program.methods
    .bid(new BN(bidInput.bidLamports))
    .accountsStrict(bidAccounts)
    .rpc();
  console.log(`✅ Tx2: https://explorer.solana.com/tx/${tx2}?cluster=devnet`);

  console.log('\n🤖 3. CLAIM TASK');
  console.log('What: Agent claims task → claim PDA created. Status → InProgress.');
  console.log('PDAs: claim. Escrow: still locked.');

  const [claimPda] = PublicKey.findProgramAddressSync([Buffer.from('claim'), taskPda.toBuffer(), creatorAgentPda.toBuffer()], program.programId);

  const claimAccounts = {
    task: taskPda,
    claim: claimPda,
    protocol_config: protocolConfigPda,
    worker: creatorAgentPda,
    authority: wallet.publicKey,
    system_program: SystemProgram.programId,
  };

  const tx3 = await program.methods
    .claimTask()
    .accountsStrict(claimAccounts)
    .rpc();
  console.log(`✅ Tx3: https://explorer.solana.com/tx/${tx3}?cluster=devnet`);

  console.log('\n🎉 4. COMPLETE TASK');
  console.log('What: Worker submits proof + result. Escrow releases SOL.');

  const proofHash = Buffer.alloc(32, 0xaa);
  const resultData = Buffer.alloc(64);
  Buffer.from('dummy-result-payload').copy(resultData);

  const completeAccounts = {
    task: taskPda,
    claim: claimPda,
    escrow: escrowPda,
    creator: wallet.publicKey,
    worker: creatorAgentPda,
    protocol_config: protocolConfigPda,
    treasury: wallet.publicKey,
    authority: wallet.publicKey,
    system_program: SystemProgram.programId,
  };

  const tx4 = await program.methods
    .completeTask(proofHash, { data: resultData })
    .accountsStrict(completeAccounts)
    .rpc();
  console.log(`✅ Tx4: https://explorer.solana.com/tx/${tx4}?cluster=devnet`);

  console.log('\n✅ Full flow verified — check explorer links above');
  console.log('Tx1:', tx1);
  console.log('Tx2:', tx2);
  console.log('Tx3:', tx3);
  console.log('Tx4:', tx4);
}

main().catch(console.error);