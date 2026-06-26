# MASTER BUILD PROMPT — Token Swap Liquidity Pool (Stellar Soroban dApp)

Copy everything below this line into a fresh coding agent session (Claude Code, Antigravity, etc.) as a single prompt.

---

## ROLE & GOAL

You are building a **complete, original, production-grade, fully working Stellar Soroban dApp** — a decentralized token swap exchange with liquidity pools. This is for a hackathon-style challenge graded against a strict checklist. Treat every requirement below as **mandatory and individually verifiable** — not aspirational. Do not skip, fake, simulate, or stub anything. If something cannot be completed for real, stop and report it instead of inventing a placeholder.

**IMPORTANT — originality requirement:** This must be an independently designed and written implementation. Do not reference, copy, or pattern-match against any specific existing GitHub repository's code, file structure, variable names, or UI design. The AMM/liquidity-pool concept itself is a well-known, generic DeFi pattern (constant-product market maker) — build your own clean-room implementation of it from these requirements, with your own naming, architecture decisions, and visual design.

**Concept:** Users can swap between a custom token and native XLM through a liquidity pool, and can supply liquidity to that pool to earn a share of trading fees, represented by LP (liquidity provider) share tokens. This requires a genuine 3-contract chain: a `Pool` contract that holds reserves and executes swaps/liquidity changes by calling two other contracts — the `Token` being traded, and an `LPShare` token contract that the pool mints/burns to track each provider's ownership stake.

---

## HARD RULES (violating any of these is a failure of the task)

1. **Never fabricate a transaction hash, contract address, or account ID.** Every hash/address in the README MUST come from a command you actually ran against Stellar testnet. A real transaction hash is exactly 64 lowercase hex characters (`0-9a-f`); a real contract address is 56 characters starting with `C`. Validate both formats before writing them anywhere. If you don't have a real value yet, write `PENDING — generate after deployment`, never a placeholder-looking string.
2. **Never claim a screenshot exists if you didn't capture it.** If you can't capture a literal screenshot yet, say so explicitly in the README with instructions for the human to capture it later.
3. **Every checklist item below must have a corresponding, explicitly labeled README section** — use the exact item wording as a heading so it's trivially matchable during review.
4. **All inter-contract relationships must be real Soroban-to-Soroban invocation** (`env.invoke_contract` or the typed SDK client equivalent), not faked/simulated:
   - `Pool` → `Token` (on every swap and on liquidity add/remove, to move the traded asset)
   - `Pool` → `LPShare` (mint shares on add-liquidity, burn shares on remove-liquidity)
5. **Build incrementally with meaningful, separate git commits** (minimum 12), reflecting real progressive stages — see the commit plan below.
6. **Test output, CI runs, and deployments must all be real and actually executed by you during this build.**

---

## TECH STACK

- **Smart contracts:** Rust + Soroban SDK (latest stable — check the current `soroban-sdk` crate version at build time)
- **Frontend:** Next.js 14 (App Router) + TypeScript, static export (`output: 'export'`) for clean deployment to Cloudflare Workers static assets (or Vercel/Netlify)
- **Wallet integration:** `@creit.tech/stellar-wallets-kit`, Freighter as primary tested path
- **Data fetching/polling:** SWR
- **Styling:** Tailwind CSS
- **Charts:** a lightweight chart library (e.g. `recharts`) for the pool price/reserves history
- **Deployment:** Cloudflare Workers static assets (root `wrangler.toml`, matching the proven setup from prior projects in this series) or Vercel/Netlify
- **CI/CD:** GitHub Actions

---

## SMART CONTRACT ARCHITECTURE

### Contract 1: `token` — the custom tradeable asset
- Standard fungible token: `balance`, `transfer`, `mint` (testnet faucet-style, open or owner-gated — your choice, document it), `decimals`, `symbol`
- The pool's other side is **native XLM** via the Stellar Asset Contract (SAC) wrapper — don't write a redundant contract for XLM itself

### Contract 2: `lp_share` — liquidity provider share token
- Minimal fungible token tracking each provider's proportional claim on the pool
- `mint(to: Address, amount: i128)` — **callable only by the `Pool` contract** (enforce with an address check)
- `burn(from: Address, amount: i128)` — **callable only by the `Pool` contract**
- `balance(address: Address) -> i128`, `total_supply() -> i128`

### Contract 3: `pool` — the AMM core
State: `reserve_token: i128`, `reserve_xlm: i128`, fee in basis points (e.g. `30` = 0.3%).

Functions required:
- `init(token_address: Address, lp_share_address: Address, fee_bps: u32)` — one-time setup
- `add_liquidity(provider: Address, token_amount: i128, xlm_amount: i128) -> i128` — `require_auth(provider)`, transfers both assets from the provider into the pool (calls `token` and the native SAC), computes the LP shares to mint (proportional to existing reserves, or `sqrt(token_amount * xlm_amount)` for the very first deposit), **calls `lp_share.mint`**, updates reserves, emits `liquidity_added`, returns shares minted
- `remove_liquidity(provider: Address, shares: i128) -> (i128, i128)` — `require_auth(provider)`, computes the proportional token/XLM amounts owed based on `shares / total_supply`, **calls `lp_share.burn`**, transfers both assets back to the provider, updates reserves, emits `liquidity_removed`, returns amounts returned
- `swap(trader: Address, amount_in: i128, min_amount_out: i128, token_in_is_xlm: bool) -> i128` — `require_auth(trader)`, applies the constant-product formula with fee (`x * y = k`, fee deducted from `amount_in` before computing output), enforces `amount_out >= min_amount_out` (slippage protection) or fails, **calls the relevant token contract(s) to pull `amount_in` and pay out `amount_out`**, updates reserves, emits `swap_executed` with both amounts, returns `amount_out`
- `get_reserves() -> (i128, i128)` — read
- `get_price() -> i128` (or a fixed-point ratio) — read, for the frontend's live price display

**Events to emit:** `liquidity_added`, `liquidity_removed`, `swap_executed`. The frontend must listen for/poll these for a live trade feed and reserve/price updates — satisfies "event streaming & real-time updates."

### Testing (mandatory, real, must actually pass)
Write **at least 6** Rust unit tests across the `pool` and `lp_share` crates:
1. `add_liquidity` on an empty pool sets the initial price ratio correctly and mints the expected first-deposit share amount
2. `add_liquidity` on a non-empty pool mints shares proportional to existing reserves (test with an unbalanced deposit attempt and confirm correct handling)
3. `swap` produces output matching the constant-product formula exactly (including fee deduction) for a known input
4. `swap` correctly rejects a trade that would produce less than `min_amount_out` (slippage protection works)
5. `remove_liquidity` returns proportionally correct amounts of both assets and burns the right number of shares
6. Reserves invariant holds: `reserve_token * reserve_xlm` never decreases from a swap (only increases, from fees) — write a property-style test asserting this across a sequence of swaps

Capture the real terminal output of a full passing test run.

---

## FRONTEND REQUIREMENTS

### Wallet flow
- Connect/disconnect via StellarWalletsKit
- Display connected address (truncated) and live XLM + custom-token balances, refreshed via SWR polling and after every transaction

### Core UI screens/components
1. **Swap interface** — input amount + token selector (Token ⇄ XLM), live estimated output with slippage tolerance setting, "Swap" button, clear display of the pool fee
2. **Liquidity panel** — add liquidity (dual-amount input, auto-balances to current pool ratio) and remove liquidity (by % of your shares or exact share amount), showing your current LP share balance and what it's worth in underlying assets
3. **Pool stats dashboard** — current reserves, current price/ratio, total liquidity, a simple price-history chart built from polled `swap_executed` events
4. **Transaction feedback** — pending → success (tx hash + Stellar Expert link) or failure (human-readable reason) for every action, never silent
5. **Live activity feed** — recent swaps and liquidity changes across the pool, updating without a full reload

### Required error handling — at least these 3 distinct, clearly differentiated states:
1. **Wallet not installed/found**
2. **User rejected the signature request**
3. **Insufficient balance** (pre-validate before submitting, and/or catch and explain the contract error) — also handle and clearly explain a **slippage failure** as a related but distinct case if time allows

### Mobile responsiveness
- Genuinely responsive at ~375px and ~768px — stacked layout, no horizontal overflow, swap interface usable one-handed

---

## DESIGN DIRECTION

Avoid the generic dark-glassmorphism crypto-dashboard look that's become a cliché in this category. Choose one distinctive, intentional visual identity (e.g. a clean editorial/data-forward look, or a bold single-accent minimal look) and apply it consistently. The swap interface and price chart are the hero elements — design typography and layout to make numbers feel precise and trustworthy rather than flashy. Consult any available frontend design skill/guidance in your environment before finalizing styling. Do not reproduce the visual layout, color palette, or component structure of any existing Stellar swap dApp you may be aware of — design this independently from the functional requirements above.

---

## CI/CD PIPELINE

`.github/workflows/ci.yml`, running on every push/PR to main:
1. **Contracts job:** install Rust + `wasm32-unknown-unknown`, run `cargo test` for `pool` and `lp_share`, build optimized WASM for all three contracts
2. **Frontend job:** install Node deps, run lint, run `npm run build`
3. Real passing badge at the top of the README — push and let it actually run before writing it up

---

## DEPLOYMENT WORKFLOW (must be executed for real)

1. Fund a deployer testnet account via Friendbot
2. Deploy `token` — record the real address
3. Deploy `lp_share` — record the real address
4. Deploy `pool`, initialized with both addresses and the fee — record the real address
5. From a funded test account: actually call `add_liquidity`, then `swap`, then `remove_liquidity` — capture the **real transaction hashes** for all three
6. Verify all three contract addresses and all transaction hashes resolve on `https://stellar.expert/explorer/testnet/...` before putting them in the README
7. Deploy the frontend and get a real live URL; wire deployed contract addresses into build-time environment variables (remember: with `output: 'export'`, `NEXT_PUBLIC_*` vars must be set wherever the build runs)

---

## README STRUCTURE (mirror this exactly, heading-for-heading)

```
# <Project Name>

[CI/CD badge] [Stellar Testnet badge] [License badge]

Live Demo: <real url>
Demo Video (1–2 min): <real url>

## Project Description
## Architecture (diagram: Pool <-> Token, Pool <-> LPShare, Frontend <-> Wallet)
## Tech Stack
## Smart Contracts (Testnet)
| Contract | Address | Stellar Expert Link |
## Inter-Contract Calls
  - Pool -> Token: explain exactly when/why
  - Pool -> LPShare: explain exactly when/why (mint on add, burn on remove)
  - Transaction Hash Evidence: add-liquidity tx, swap tx, remove-liquidity tx (real hashes + links)
## Wallet Connection (Connect / Disconnect)
## AMM Mechanics (constant-product formula, fee model, slippage protection)
## Error Handling (list the 3+ handled error types explicitly)
## Screenshots
  - Wallet connected state
  - Swap flow with live quote
  - Add/remove liquidity flow
  - Successful transaction confirmation
  - Mobile responsive UI
  - CI/CD pipeline run (real Actions tab screenshot)
  - Test output (real terminal output, 6+ passing tests)
## Setup Instructions
## Testing
## Commit History Summary
## License
```

---

## COMMIT PLAN (minimum 12 commits, real and incremental — do not squash)

1. `chore: project scaffold (Next.js + Soroban workspace)`
2. `feat: custom token contract`
3. `feat: lp_share token contract (mint/burn restricted to pool)`
4. `feat: pool contract — add_liquidity with first-deposit pricing`
5. `feat: pool contract — swap with constant-product formula and fees`
6. `feat: pool contract — remove_liquidity`
7. `test: pool + lp_share unit tests (6+ passing, including invariant test)`
8. `feat: wallet connect/disconnect via StellarWalletsKit`
9. `feat: swap UI with live quote and slippage setting`
10. `feat: liquidity add/remove UI + pool stats dashboard`
11. `feat: error handling (wallet missing, rejected signature, insufficient balance, slippage)`
12. `feat: mobile responsive layout`
13. `ci: GitHub Actions pipeline for contracts + frontend`
14. `chore: testnet deployment + real contract addresses wired in`
15. `docs: README with full evidence (addresses, tx hashes, screenshots)`

---

## FINAL VERIFICATION CHECKLIST

- [ ] All three contracts actually deployed on testnet, addresses verified on Stellar Expert
- [ ] Real `add_liquidity`, `swap`, and `remove_liquidity` transactions executed, all hashes verified on Stellar Expert
- [ ] `pool` provably calls `token` and `lp_share` (visible in code + reflected in real transaction effects)
- [ ] Constant-product invariant verified by an actual passing test, not just asserted in prose
- [ ] 6+ contract tests written and actually passing, output captured
- [ ] CI workflow actually ran and passed, screenshot captured from the real Actions tab
- [ ] Wallet connect, disconnect, balance display, and 3+ distinct error states all manually verified working
- [ ] Mobile layout manually checked at ~375px
- [ ] Live demo URL is real, loads, and matches what's in the README
- [ ] No placeholder/fake hashes, addresses, or screenshots anywhere in the repo
- [ ] No code, file structure, or visual design copied from any existing reference repository
- [ ] 12+ real, incremental commits in git history

Begin building now. Work through the contract layer first, verify it with real tests and a real testnet deployment, then build the frontend against the real deployed addresses, then finish with CI/CD and the README.
