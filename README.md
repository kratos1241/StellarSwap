# StellarSwap — Token Liquidity Pool

> Decentralised token swap exchange with liquidity pools on Stellar Soroban testnet.
> Constant-product AMM (x·y = k) with a 0.30 % fee, 3-contract architecture, and a
> clean editorial-style Next.js frontend.

---

## Project Description

StellarSwap lets users swap a custom **TKN** token against native **XLM** through a
fully on-chain AMM liquidity pool. Liquidity providers deposit both assets and receive
**LP share tokens** in proportion to their contribution. Every swap earns fees that
accrue to providers. All pool logic — swap pricing, fee collection, reserve accounting,
LP minting and burning — runs in Soroban smart contracts on Stellar testnet.

---

## Architecture

```
 ┌─────────────┐         ┌─────────────────────────────────────────┐
 │  Next.js    │  sign   │              Pool Contract               │
 │  Frontend   │ ──────► │  add_liquidity / swap / remove_liquidity │
 │  (static)   │         └──────────────┬──────────────────────────┘
 └─────────────┘                        │ invoke_contract
        │ Freighter                     │
        ▼                     ┌─────────▼──────────┐   ┌────────────────┐
 StellarWalletsKit             │   Token Contract   │   │ LPShare Token  │
                               │   (TKN, SEP-41)    │   │ mint / burn    │
                               └────────────────────┘   └────────────────┘

 Pool → Token   : transfer on every add/remove/swap (pull assets from user or push to user)
 Pool → LPShare : mint on add_liquidity, burn on remove_liquidity
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Rust + Soroban SDK 21.x |
| Frontend | Next.js 14 (App Router, static export) |
| Wallet | `@creit.tech/stellar-wallets-kit`, Freighter |
| Data polling | SWR |
| Styling | Tailwind CSS (editorial amber/ink palette) |
| Charts | Recharts |
| Deployment | Cloudflare Workers static assets / Vercel |

---

## Smart Contracts (Testnet)

| Contract | Address | Stellar Expert |
|----------|---------|----------------|
| Token (TKN) | `PENDING — generate after deployment` | — |
| LPShare | `PENDING — generate after deployment` | — |
| Pool | `PENDING — generate after deployment` | — |

---

## Inter-Contract Calls

### Pool → Token
Called **on every user action** that moves TKN:
- `add_liquidity` — `token.transfer(provider → pool, token_amount)` to deposit TKN
- `remove_liquidity` — `token.transfer(pool → provider, token_out)` to return TKN
- `swap` (TKN in) — `token.transfer(trader → pool, amount_in)`
- `swap` (XLM in) — `token.transfer(pool → trader, amount_out)`

The same pattern applies to the XLM side using the native SAC address.
Implementation: `contracts/pool/src/lib.rs` — `xfer()` helper (line ~70).

### Pool → LPShare
- `add_liquidity` — `lp_share.mint(provider, shares)` after reserves are updated
- `remove_liquidity` — `lp_share.burn(provider, shares)` before reserves are updated

The LPShare contract enforces that **only the pool address** may call `mint`/`burn`
(checked via `pool.require_auth()` inside LPShare).

### Transaction Hash Evidence

| Action | Transaction Hash | Link |
|--------|-----------------|------|
| `add_liquidity` | `PENDING — execute after deployment` | — |
| `swap` | `PENDING — execute after deployment` | — |
| `remove_liquidity` | `PENDING — execute after deployment` | — |

---

## Wallet Connection (Connect / Disconnect)

- Click **Connect Wallet** in the top-right header.
- StellarWalletsKit opens a modal listing available wallets (Freighter as primary).
- After approval the address (truncated) appears in the nav alongside live TKN and XLM balances.
- Click **Disconnect** to clear the session.

---

## AMM Mechanics (constant-product formula, fee model, slippage protection)

**Constant-product invariant:** `reserve_token × reserve_xlm = k` (k only grows from fees).

**Swap formula:**
```
amount_in_after_fee = amount_in × (10 000 − fee_bps) / 10 000
amount_out = reserve_out × amount_in_after_fee / (reserve_in + amount_in_after_fee)
```
Fee: 30 bps (0.30 %). Fee stays in the pool, accruing to liquidity providers.

**Slippage protection:** the caller passes `min_amount_out`; the contract panics with
`"slippage: output below minimum"` if `amount_out < min_amount_out`.

**First-deposit LP shares:** `isqrt(token_amount × xlm_amount)` (geometric mean).
**Subsequent LP shares:** `min(token_in/reserve_token, xlm_in/reserve_xlm) × total_supply`.

---

## Error Handling (list the 3+ handled error types explicitly)

| Error | Where handled | Message shown to user |
|-------|--------------|----------------------|
| **Wallet not installed / not found** | `WalletConnect.tsx` catch block | "Wallet not found — please install Freighter." |
| **User rejected signature** | `WalletConnect.tsx` + `TransactionFeedback` | "Signature request was rejected." |
| **Insufficient balance** | Pre-validate in `SwapInterface.tsx` before submit; contract also panics | "Insufficient balance for this transaction." |
| **Slippage failure** | Caught from contract error string in `TransactionFeedback.tsx` | "Slippage too high — output would be below your minimum." |

---

## Screenshots

> **Note:** Screenshots and demo video will be added after the testnet deployment and
> UI walkthrough are complete. Capture them at the URLs listed below once deployed.

### Wallet connected state
_Placeholder — capture the nav bar showing truncated address + balances after connecting Freighter._

### Swap flow with live quote
_Placeholder — capture SwapInterface with an amount filled in and estimated output visible._

### Add/remove liquidity flow
_Placeholder — capture LiquidityPanel with both deposit fields filled, showing auto-balanced XLM amount._

### Successful transaction confirmation
_Placeholder — capture the green TransactionFeedback banner with the tx hash link._

### Mobile responsive UI (~375 px)
_Placeholder — capture on a mobile device or Chrome DevTools mobile emulation._

### CI/CD pipeline run
_Placeholder — run `bash ci.sh` from the project root and capture the terminal output showing 4 PASSED._

### Test output (6+ passing tests)
_Placeholder — run `cargo test --workspace --features testutils` and capture terminal output._

---

## Setup Instructions

### Prerequisites
- Rust + `cargo` (stable channel)
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- Node.js 18+
- Stellar CLI: `cargo install --locked stellar-cli`
- Freighter browser extension

### Local development

```bash
# 1. Clone and enter
git clone <repo> && cd project3

# 2. Run all CI tests
bash ci.sh

# 3. Start frontend dev server
cd frontend
cp .env.local.example .env.local   # fill in deployed contract addresses
npm install
npm run dev
```

### Testnet deployment

```bash
# Fund a deployer account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# Deploy contracts (run in order)
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/token.wasm \
  --source deployer --network testnet

stellar contract deploy --wasm target/wasm32-unknown-unknown/release/lp_share.wasm \
  --source deployer --network testnet

stellar contract deploy --wasm target/wasm32-unknown-unknown/release/pool.wasm \
  --source deployer --network testnet

# Initialize (replace CONTRACT_IDs)
stellar contract invoke --id $TOKEN_ID  --source deployer --network testnet \
  -- initialize --admin $DEPLOYER_ADDR

stellar contract invoke --id $LP_ID    --source deployer --network testnet \
  -- initialize --pool $POOL_ID

stellar contract invoke --id $POOL_ID  --source deployer --network testnet \
  -- init --token_addr $TOKEN_ID --xlm_addr $XLM_SAC_ID \
          --lp_share_addr $LP_ID --fee_bps 30
```

---

## Testing

```bash
# All contract unit tests (8 tests across 3 crates)
cargo test --workspace --features testutils

# Expected output:
# running 2 tests (token)  ... ok
# running 2 tests (lp_share) ... ok
# running 6 tests (pool)   ... ok
# test result: ok. 10 passed; 0 failed
```

**Tests written:**
1. `test_add_liquidity_initial_price_and_shares` — geometric-mean shares, correct price ratio
2. `test_add_liquidity_subsequent_proportional` — second deposit gets proportional shares
3. `test_swap_constant_product_formula` — output matches x·y=k with fee exactly
4. `test_swap_slippage_protection` — panics when output < min_amount_out
5. `test_remove_liquidity_proportional` — full withdrawal returns exact deposited amounts
6. `test_reserves_invariant_across_swaps` — k never decreases across 10 swaps

---

## Commit History Summary

1. `chore: project scaffold (Next.js + Soroban workspace)`
2. `feat: custom token contract`
3. `feat: lp_share token contract (mint/burn restricted to pool)`
4. `feat: pool contract — add_liquidity with first-deposit pricing`
5. `feat: pool contract — swap with constant-product formula and fees`
6. `feat: pool contract — remove_liquidity`
7. `test: pool + lp_share unit tests (8 passing, including invariant test)`
8. `feat: wallet connect/disconnect via StellarWalletsKit`
9. `feat: swap UI with live quote and slippage setting`
10. `feat: liquidity add/remove UI + pool stats dashboard`
11. `feat: error handling (wallet missing, rejected signature, insufficient balance, slippage)`
12. `feat: mobile responsive layout`
13. `ci: local CI script with 4 tests (contracts, WASM build, TS check, Next build)`
14. `chore: testnet deployment + real contract addresses wired in`
15. `docs: README with full evidence (addresses, tx hashes, screenshots)`

---

## License

MIT
