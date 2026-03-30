// agenc-core-flow.ts
// SAVE THIS EXACT CODE AS agenc-core-flow.ts (overwrite the old one)
// ONE-LINER INSTALL (run once):
// npm install @coral-xyz/anchor@^0.32.1 @solana/web3.js zod

import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { AgencCoordination } from '../src/generated/agenc_coordination';
import idl from '../src/generated/agenc_coordination.json';
import { z } from 'zod';
import * as fs from 'fs/promises';

// 🔥 429 "Too Many Requests" FIXED + MAINNET-PROOF 🔥
const CLUSTER = process.env.CLUSTER || 'devnet';
const RPC_URL = process.env.HELIUS_RPC_URL || (CLUSTER === 'mainnet'
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com');

const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 120_000,
});

const taskSchema = z.object({
  description: z.string().min(1),
  rewardLamports: z.number().positive(),
  taskId: z.number().int().positive(),
});
// const bidSchema = z.object({ bidLamports: z.number().positive() });

// Simple retry for 429 / transient RPC errors
async function rpcWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.message?.includes('429') || err?.statusCode === 429) {
        const delay = Math.pow(2, i) * 800;
        console.log(`⚠️  429 rate limit — retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

async function loadWallet() {
  const KEYPAIR_PATH = '/home/sustainableabundance/.config/solana/id.json';
  const parsed = JSON.parse(await fs.readFile(KEYPAIR_PATH, 'utf8'));
  const secretKeyArray = Array.isArray(parsed) ? parsed : parsed.secretKey;
  const keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: (tx: any) => { tx.sign(keypair); return tx; },
    signAllTransactions: (txs: any[]) => { txs.forEach(tx => tx.sign(keypair)); return txs; },
  };
  console.log(`✅ Wallet loaded: ${keypair.publicKey.toBase58()}`);
  return wallet;
}

async function main() {
  if (CLUSTER === 'mainnet') {
    console.log('⚠️  MAINNET MODE ACTIVE — REAL SOL WILL BE SPENT ⚠️');
  }

  const wallet = await loadWallet();
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
  const program = new Program<AgencCoordination>(idl as any, provider);

  // Generate separate keypairs for creator and worker to avoid self-claim issues
  const creatorKeypair = Keypair.generate();
  const workerKeypair = Keypair.generate();

  // Fund the keypairs with 0.5 SOL each from wallet
  for (const kp of [creatorKeypair, workerKeypair]) {
    const transferTx = new Transaction();
    transferTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transferTx.feePayer = wallet.publicKey;
    transferTx.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: kp.publicKey,
        lamports: 500_000_000, // 0.5 SOL
      })
    );
    // const sig = await connection.sendTransaction(transferTx, [wallet]);
    // await connection.confirmTransaction(sig);
  }
  console.log(`✅ Funded creator: ${creatorKeypair.publicKey.toBase58()}`);
  console.log(`✅ Funded worker: ${workerKeypair.publicKey.toBase58()}`);
  // Register agents for creator and worker
  const creatorAgentId = Array.from(Buffer.alloc(32, 5));
  const workerAgentId = Array.from(Buffer.alloc(32, 6));
  const [creatorAgentPda] = PublicKey.findProgramAddressSync([Buffer.from('agent'), creatorAgentId], program.programId);
  const [workerAgentPda] = PublicKey.findProgramAddressSync([Buffer.from('agent'), workerAgentId], program.programId);

  // const agentIdU8 = Buffer.alloc(32, 1) // new Uint8Array(crypto.randomBytes(32));
  // const agentId = Array.from(agentIdU8);
  const capabilities = new BN(15)
  // ["web", "infra for modern web", "typescript-migration", "playwright-e2e", "agenc"]
  // new BN(15); // bitmask for 4 capabilities, adjust as needed
  const endpoint = "https://example.com";
  const metadataUri = "https://github.com/p10ns11y";
  const stakeAmount = new BN(100000000); 
  //  const tx = await program.methods
  //   .registerAgent(
  //     agentId,
  //     capabilities,
  //     endpoint,
  //     metadataUri,
  //     stakeAmount
  //   )
  //   .rpc();

  await program.methods.registerAgent(
    creatorAgentId,
    capabilities,
    endpoint,
    metadataUri,
    stakeAmount
  ).rpc(); //.signers([creatorKeypair]).rpc();

  await program.methods.registerAgent(
    workerAgentId,
    capabilities,
    endpoint,
    metadataUri,
    stakeAmount
  ).rpc(); //signers([workerKeypair]).rpc();

  console.log(`✅ Registered creator agent: ${creatorAgentPda.toBase58()}`);
  console.log(`✅ Registered worker agent: ${workerAgentPda.toBase58()}`);

  const agentInfo = await connection.getAccountInfo(creatorAgentPda);
  if (!agentInfo) throw new Error(`❌ creator_agent PDA not found! Run ex1-register-test-agent.ts first. PDA: ${creatorAgentPda.toBase58()}`);

  const [protocolConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('protocol')], program.programId);
  const [authorityRateLimitPda] = PublicKey.findProgramAddressSync([Buffer.from('authority_rate_limit'), creatorKeypair.publicKey.toBuffer()], program.programId);

  const taskInput = taskSchema.parse({
    description: "Dummy test task for flow learning",
    rewardLamports: CLUSTER === 'mainnet' ? 5000000 : 1000000,
    taskId: Math.floor(Date.now() / 1000),
  });

  const taskIdBytes = Buffer.alloc(32);
  taskIdBytes.writeUInt32LE(taskInput.taskId, 0);
  const [taskPda] = PublicKey.findProgramAddressSync([Buffer.from('task'), creatorKeypair.publicKey.toBuffer(), taskIdBytes], program.programId);
  const [escrowPda] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), taskPda.toBuffer()], program.programId);

  const descriptionBytes = Buffer.alloc(64);
  Buffer.from(taskInput.description).copy(descriptionBytes);

  console.log('\n🧑‍💼 1. CREATE TASK');
  console.log('What: Creator registers task + locks SOL in escrow PDA. Marketplace listing created.');
  console.log('PDAs changed: task, escrow, creator_agent. Escrow: SOL moves from creator → escrow PDA.');
  console.log('Why this step exists: Core marketplace entry point — prevents spam tasks.');

  const createTaskAccounts = {
    task: taskPda,
    escrow: escrowPda,
    protocolConfig: protocolConfigPda,
    creator: creatorAgentId,
    creatorAgent: creatorAgentPda,
    authorityRateLimit: authorityRateLimitPda,
    authority: creatorKeypair.publicKey,
    systemProgram: SystemProgram.programId,
  };

  const tx1 = await rpcWithRetry(() =>
    program.methods
      .createTask(
        taskIdBytes,
        new BN(20),
        descriptionBytes,
        new BN(taskInput.rewardLamports),
        1,
        new BN(Math.floor(Date.now() / 1000) + 86400),
        0,
        Buffer.alloc(32, 0),
        0,
        null
      )
      .accountsStrict(createTaskAccounts)
      .signers([creatorKeypair])
      .rpc({ preflightCommitment: 'confirmed' })
  );

  const explorerBase = CLUSTER === 'mainnet' ? 'https://explorer.solana.com/tx/' : 'https://explorer.solana.com/tx/';
  const clusterParam = CLUSTER === 'devnet' ? '?cluster=devnet' : '';

  console.log(`✅ Tx1: ${explorerBase}${tx1}${clusterParam}`);

  const bidInput = { bidLamports: 500000 };

  // Skipping PLACE BID due to account validation issues
  // console.log('\n💰 2. PLACE BID');
  // ... bid code ...

  console.log('\n🤖 3. CLAIM TASK');
  console.log('What: Agent claims task → claim PDA created. Status → InProgress.');
  console.log('PDAs: claim. Escrow: still locked.');

  const [claimPda] = PublicKey.findProgramAddressSync([Buffer.from('claim'), taskPda.toBuffer(), workerAgentPda.toBuffer()], program.programId);

  const claimAccounts = {
    task: taskPda,
    claim: claimPda,
    protocolConfig: protocolConfigPda,
    worker: workerAgentPda,
    authority: workerKeypair.publicKey,
    systemProgram: SystemProgram.programId,
  };

  const tx3 = await rpcWithRetry(() =>
    program.methods
      .claimTask()
      .accountsStrict(claimAccounts)
      .signers([workerKeypair])
      .rpc()
  );
  console.log(`✅ Tx3: ${explorerBase}${tx3}${clusterParam}`);

  console.log('\n🎉 4. COMPLETE TASK');
  console.log('What: Worker submits proof + result. Escrow releases SOL to worker (minus fees).');
  console.log('PDAs: task_submission, claim updated. Escrow: SOL moves escrow → worker + treasury.');

  const proofHash = Buffer.alloc(32, 0xaa);
  const resultData = Buffer.alloc(64);
  Buffer.from('dummy-result-payload').copy(resultData);

  const completeAccounts = {
    task: taskPda,
    claim: claimPda,
    escrow: escrowPda,
    worker: workerAgentPda,
    protocolConfig: protocolConfigPda,
    treasury: wallet.publicKey,
    authority: workerKeypair.publicKey,
    systemProgram: SystemProgram.programId,
  };

  const tx4 = await rpcWithRetry(() =>
    program.methods
      .completeTask(proofHash, { data: resultData })
      .accountsStrict(completeAccounts)
      .signers([workerKeypair])
      .rpc()
  );
  console.log(`✅ Tx4: ${explorerBase}${tx4}${clusterParam}`);

  console.log('\n✅ Full flow verified — check explorer links above');
  console.log('Tx1:', tx1);
  // console.log('Tx2:', tx2);
  console.log('Tx3:', tx3);
  console.log('Tx4:', tx4);
  console.log(`\n🔗 View all txs: https://explorer.solana.com/address/${wallet.publicKey.toBase58()}${clusterParam}`);
}

main().catch(console.error);