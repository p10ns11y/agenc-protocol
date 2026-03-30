import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import idl from '../src/generated/agenc_coordination.json';

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const programId = new PublicKey(idl.address);
const program = new Program(idl as anchor.Idl, programId, provider);

async function main() {
  console.log('Program ID:', programId.toString());
  console.log('Wallet:', provider.wallet.publicKey.toString());

  const [protocolConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('protocol')], programId);
  console.log('Protocol config PDA:', protocolConfigPda.toString());

  // Check if already initialized (optional: fetch account data)
  try {
    const configAccount = await program.account.protocolConfig.fetch(protocolConfigPda);
    console.log('Already initialized:', configAccount);
    return;
  } catch (e) {
    console.log('Not initialized, running init...');
  }

  // Init instruction - adjust name/args/accounts from IDL.instructions.find(i => i.name.includes('initialize'))
  // Assumed "initialize_protocol_config" , accounts from IDL pattern
  const tx = await program.methods
    .initializeProtocolConfig() // CHANGE to exact IDL name (e.g. 'initialize', log IDL below)
    .accounts({
      protocol_config: protocolConfigPda,
      payer: provider.wallet.publicKey,
      system_program: SystemProgram.programId,
    })
    .rpc({ commitment: 'confirmed' });

  console.log('Init tx sig:', tx);
  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

console.log('IDL instructions:', idl.instructions.map(i => i.name));
main().catch(console.error);