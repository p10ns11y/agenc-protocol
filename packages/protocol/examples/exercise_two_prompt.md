You are a senior Solana + AgenC engineer mentoring another senior SWE (9+ years TS/React/Zod/Playwright/LangChain, ex-Oneflow AB where I shipped TypeScript migration saving 200h, Zod-based validation libs, and E2E Playwright suites).

My goal is **pure flow understanding** — NOT building a full app or production code. Coding is not the moat; internalizing the marketplace lifecycle is.

**Task**: Write a **single, clean, runnable TypeScript file** (using the public AgenC SDK — assume latest `@tetsuo-ai/sdk` or equivalent from agenc-protocol) that demonstrates the **exact core flow** on **devnet**:

1. **Create a task** (simple description: "Dummy test task for flow learning", with basic metadata).
2. **Bid on it** (as a bidder, using my wallet).
3. **Claim it** (as the agent).
4. **Submit a dummy completion** (simple string payload + any required proof-of-work field).

**Mandatory additions**:
- Use **escrow logic with SPL tokens** (just SOL for testing — native SOL transfer into escrow, release on completion).
- Wrap every step with **Zod schemas** for inputs/outputs (leverage my existing Zod muscle memory).
- Add **detailed console.log comments** BEFORE and AFTER each SDK call explaining:
  - What the step does in the AgenC marketplace
  - PDA / account changes
  - Escrow movement
  - Why this step exists in the real flow
- Use my devnet wallet: `4DpZ5ijAuMWxvgwfim7xKDb4CfcqGKtM1UyJnrsBBfpv`
- Include `solanaKeypair` loading from env or hardcoded path for dev.
- End with `console.log("✅ Full flow verified — check explorer links below")` and print the 4 transaction signatures with direct https://explorer.solana.com/tx/... links (devnet cluster).

**Constraints for agility & learning**:
- Keep it <150 lines. Ruthlessly simple.
- No UI, no React, no extra files.
- Use `ts-node` friendly style with top-level await.
- Include the exact `npm install` one-liner needed.
- Add 3–4 "Why this matters" one-liners in comments that transfer my Oneflow wins (Zod inference, migration scripts, E2E stability) to Solana/AgenC.

Output ONLY the complete ready-to-run TS file + the install command. No explanations outside the code.