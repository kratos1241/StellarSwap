#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Symbol, Val, Vec,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    TokenAddr,
    XlmAddr,
    LpShareAddr,
    ReserveToken,
    ReserveXlm,
    FeeBps,
    Initialized,
}

// ─── Events ──────────────────────────────────────────────────────────────────

const EVT_ADDED: Symbol = symbol_short!("liq_added");
const EVT_REMOVED: Symbol = symbol_short!("liq_rmvd");
const EVT_SWAP: Symbol = symbol_short!("swapped");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Integer square root (Newton's method).
fn isqrt(n: i128) -> i128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Cross-contract: call `transfer(from, to, amount)` on any SEP-41 token.
fn xfer(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) {
    let args: Vec<Val> = soroban_sdk::vec![
        env,
        from.clone().into_val(env),
        to.clone().into_val(env),
        amount.into_val(env),
    ];
    env.invoke_contract::<()>(token, &Symbol::new(env, "transfer"), args);
}

/// Cross-contract: call `mint(to, amount)` on the lp_share contract.
fn lp_mint(env: &Env, lp: &Address, to: &Address, amount: i128) {
    let args: Vec<Val> = soroban_sdk::vec![
        env,
        to.clone().into_val(env),
        amount.into_val(env),
    ];
    env.invoke_contract::<()>(lp, &Symbol::new(env, "mint"), args);
}

/// Cross-contract: call `burn(from, amount)` on the lp_share contract.
fn lp_burn(env: &Env, lp: &Address, from: &Address, amount: i128) {
    let args: Vec<Val> = soroban_sdk::vec![
        env,
        from.clone().into_val(env),
        amount.into_val(env),
    ];
    env.invoke_contract::<()>(lp, &Symbol::new(env, "burn"), args);
}

/// Cross-contract: call `total_supply()` on the lp_share contract.
fn lp_total_supply(env: &Env, lp: &Address) -> i128 {
    let args: Vec<Val> = soroban_sdk::vec![env];
    env.invoke_contract::<i128>(lp, &Symbol::new(env, "total_supply"), args)
}

/// Allow the pool contract to act as the `from` in a custom token transfer.
/// The XLM SAC handles this internally; our token needs an explicit authorization.
fn authorize_pool_as_sender(env: &Env, token: &Address, to: &Address, amount: i128) {
    let pool = env.current_contract_address();
    let args: Vec<Val> = soroban_sdk::vec![
        env,
        pool.clone().into_val(env),
        to.clone().into_val(env),
        amount.into_val(env),
    ];
    env.authorize_as_current_contract(soroban_sdk::vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: token.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args,
            },
            sub_invocations: soroban_sdk::vec![env],
        }),
    ]);
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct PoolContract;

#[contractimpl]
impl PoolContract {
    /// One-time initialisation.
    /// `xlm_addr` should be the native-XLM SAC address on testnet/mainnet;
    /// in unit-tests a second TokenContract is registered for this slot.
    pub fn init(
        env: Env,
        token_addr: Address,
        xlm_addr: Address,
        lp_share_addr: Address,
        fee_bps: u32,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        assert!(fee_bps < 10_000, "fee must be < 100%");
        env.storage().instance().set(&DataKey::TokenAddr, &token_addr);
        env.storage().instance().set(&DataKey::XlmAddr, &xlm_addr);
        env.storage().instance().set(&DataKey::LpShareAddr, &lp_share_addr);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::ReserveToken, &0i128);
        env.storage().instance().set(&DataKey::ReserveXlm, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Read helpers ────────────────────────────────────────────────────────

    pub fn get_reserves(env: Env) -> (i128, i128) {
        let rt: i128 = env.storage().instance().get(&DataKey::ReserveToken).unwrap_or(0);
        let rx: i128 = env.storage().instance().get(&DataKey::ReserveXlm).unwrap_or(0);
        (rt, rx)
    }

    /// Returns price as (token per XLM) × 10^7, or 0 if pool is empty.
    pub fn get_price(env: Env) -> i128 {
        let rt: i128 = env.storage().instance().get(&DataKey::ReserveToken).unwrap_or(0);
        let rx: i128 = env.storage().instance().get(&DataKey::ReserveXlm).unwrap_or(0);
        if rx == 0 {
            return 0;
        }
        rt * 10_000_000 / rx
    }

    // ── add_liquidity ────────────────────────────────────────────────────────

    pub fn add_liquidity(
        env: Env,
        provider: Address,
        token_amount: i128,
        xlm_amount: i128,
    ) -> i128 {
        provider.require_auth();
        assert!(token_amount > 0 && xlm_amount > 0, "amounts must be positive");

        let pool = env.current_contract_address();
        let token: Address = env.storage().instance().get(&DataKey::TokenAddr).unwrap();
        let xlm: Address = env.storage().instance().get(&DataKey::XlmAddr).unwrap();
        let lp: Address = env.storage().instance().get(&DataKey::LpShareAddr).unwrap();

        let res_t: i128 = env.storage().instance().get(&DataKey::ReserveToken).unwrap_or(0);
        let res_x: i128 = env.storage().instance().get(&DataKey::ReserveXlm).unwrap_or(0);

        let total_supply = lp_total_supply(&env, &lp);

        let shares = if total_supply == 0 {
            // First deposit: geometric mean sets the initial price.
            isqrt(token_amount * xlm_amount)
        } else {
            // Subsequent: proportional to smaller-ratio side.
            let s_t = (token_amount * total_supply) / res_t;
            let s_x = (xlm_amount * total_supply) / res_x;
            s_t.min(s_x)
        };

        assert!(shares > 0, "shares would be zero");

        // Pull assets from provider into pool.
        xfer(&env, &token, &provider, &pool, token_amount);
        xfer(&env, &xlm, &provider, &pool, xlm_amount);

        // Mint LP shares to provider.
        lp_mint(&env, &lp, &provider, shares);

        // Update reserves.
        env.storage().instance().set(&DataKey::ReserveToken, &(res_t + token_amount));
        env.storage().instance().set(&DataKey::ReserveXlm, &(res_x + xlm_amount));

        env.events().publish((EVT_ADDED,), (provider, token_amount, xlm_amount, shares));
        shares
    }

    // ── remove_liquidity ─────────────────────────────────────────────────────

    pub fn remove_liquidity(env: Env, provider: Address, shares: i128) -> (i128, i128) {
        provider.require_auth();
        assert!(shares > 0, "shares must be positive");

        let pool = env.current_contract_address();
        let token: Address = env.storage().instance().get(&DataKey::TokenAddr).unwrap();
        let xlm: Address = env.storage().instance().get(&DataKey::XlmAddr).unwrap();
        let lp: Address = env.storage().instance().get(&DataKey::LpShareAddr).unwrap();

        let res_t: i128 = env.storage().instance().get(&DataKey::ReserveToken).unwrap();
        let res_x: i128 = env.storage().instance().get(&DataKey::ReserveXlm).unwrap();
        let total_supply = lp_total_supply(&env, &lp);

        assert!(total_supply > 0, "pool is empty");

        let token_out = (shares * res_t) / total_supply;
        let xlm_out = (shares * res_x) / total_supply;
        assert!(token_out > 0 && xlm_out > 0, "output would be zero");

        // Burn LP shares first.
        lp_burn(&env, &lp, &provider, shares);

        // Return assets to provider (authorize self as sender for custom token).
        authorize_pool_as_sender(&env, &token, &provider, token_out);
        xfer(&env, &token, &pool, &provider, token_out);
        xfer(&env, &xlm, &pool, &provider, xlm_out);

        // Update reserves.
        env.storage().instance().set(&DataKey::ReserveToken, &(res_t - token_out));
        env.storage().instance().set(&DataKey::ReserveXlm, &(res_x - xlm_out));

        env.events().publish((EVT_REMOVED,), (provider, token_out, xlm_out, shares));
        (token_out, xlm_out)
    }

    // ── swap ─────────────────────────────────────────────────────────────────

    /// Constant-product swap with fee.
    /// `token_in_is_xlm = true`  → trader sends XLM, receives Token
    /// `token_in_is_xlm = false` → trader sends Token, receives XLM
    pub fn swap(
        env: Env,
        trader: Address,
        amount_in: i128,
        min_amount_out: i128,
        token_in_is_xlm: bool,
    ) -> i128 {
        trader.require_auth();
        assert!(amount_in > 0, "amount_in must be positive");

        let pool = env.current_contract_address();
        let token: Address = env.storage().instance().get(&DataKey::TokenAddr).unwrap();
        let xlm: Address = env.storage().instance().get(&DataKey::XlmAddr).unwrap();
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();

        let res_t: i128 = env.storage().instance().get(&DataKey::ReserveToken).unwrap();
        let res_x: i128 = env.storage().instance().get(&DataKey::ReserveXlm).unwrap();

        assert!(res_t > 0 && res_x > 0, "pool has no liquidity");

        // Deduct fee from amount_in before computing output.
        let amount_in_after_fee = amount_in * (10_000 - fee_bps as i128) / 10_000;

        let (res_in, res_out, addr_in, addr_out) = if token_in_is_xlm {
            (res_x, res_t, &xlm, &token)
        } else {
            (res_t, res_x, &token, &xlm)
        };

        // x * y = k  →  dy = y * dx / (x + dx)
        let amount_out = (res_out * amount_in_after_fee) / (res_in + amount_in_after_fee);
        assert!(amount_out >= min_amount_out, "slippage: output below minimum");
        assert!(amount_out > 0, "output would be zero");

        // Pull amount_in from trader.
        xfer(&env, addr_in, &trader, &pool, amount_in);
        // Push amount_out to trader.
        // When TKN is going out (XLM in), the pool must authorize itself as sender
        // because our custom token calls require_auth(from); the XLM SAC handles
        // contract-as-sender internally so no extra auth needed on that side.
        if token_in_is_xlm {
            authorize_pool_as_sender(&env, &token, &trader, amount_out);
        }
        xfer(&env, addr_out, &pool, &trader, amount_out);

        // Update reserves.
        let (new_res_t, new_res_x) = if token_in_is_xlm {
            (res_t - amount_out, res_x + amount_in)
        } else {
            (res_t + amount_in, res_x - amount_out)
        };
        env.storage().instance().set(&DataKey::ReserveToken, &new_res_t);
        env.storage().instance().set(&DataKey::ReserveXlm, &new_res_x);

        env.events().publish(
            (EVT_SWAP,),
            (trader, amount_in, amount_out, token_in_is_xlm),
        );
        amount_out
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[allow(dead_code)]
    struct Setup {
        env: Env,
        pool: PoolContractClient<'static>,
        token: token::TokenContractClient<'static>,
        xlm: token::TokenContractClient<'static>,
        lp: lp_share::LpShareContractClient<'static>,
        admin: Address,
        alice: Address,
        bob: Address,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        // Register contracts.
        let token_id = env.register_contract(None, token::TokenContract);
        let xlm_id = env.register_contract(None, token::TokenContract);
        let lp_id = env.register_contract(None, lp_share::LpShareContract);
        let pool_id = env.register_contract(None, PoolContract);

        let token_client = token::TokenContractClient::new(&env, &token_id);
        let xlm_client = token::TokenContractClient::new(&env, &xlm_id);
        let lp_client = lp_share::LpShareContractClient::new(&env, &lp_id);
        let pool_client = PoolContractClient::new(&env, &pool_id);

        // Initialise token and xlm (admin = admin).
        token_client.initialize(&admin);
        xlm_client.initialize(&admin);

        // Initialise lp_share (only pool may mint/burn).
        lp_client.initialize(&pool_id);

        // Initialise pool.
        pool_client.init(&token_id, &xlm_id, &lp_id, &30u32);

        // Fund users: 10 000 TKN and 10 000 XLM each.
        let fund = 10_000_0000000i128;
        token_client.mint(&alice, &fund);
        xlm_client.mint(&alice, &fund);
        token_client.mint(&bob, &fund);
        xlm_client.mint(&bob, &fund);

        Setup {
            env,
            pool: pool_client,
            token: token_client,
            xlm: xlm_client,
            lp: lp_client,
            admin,
            alice,
            bob,
        }
    }

    // ── Test 1: First deposit sets price and mints geometric-mean shares ─────

    #[test]
    fn test_add_liquidity_initial_price_and_shares() {
        let s = setup();
        let token_in = 1_000_0000000i128; // 1 000 TKN
        let xlm_in = 4_000_0000000i128;   // 4 000 XLM  →  price = 4 XLM per TKN

        let shares = s.pool.add_liquidity(&s.alice, &token_in, &xlm_in);

        // Shares should equal isqrt(token_in * xlm_in).
        let expected = isqrt(token_in * xlm_in);
        assert_eq!(shares, expected);

        // Reserves should reflect deposit.
        let (rt, rx) = s.pool.get_reserves();
        assert_eq!(rt, token_in);
        assert_eq!(rx, xlm_in);

        // Price: token per XLM × 1e7 = 1000/4000 × 1e7 = 2 500 000.
        let price = s.pool.get_price();
        assert_eq!(price, 2_500_000i128);
    }

    // ── Test 2: Subsequent deposit mints proportional shares ─────────────────

    #[test]
    fn test_add_liquidity_subsequent_proportional() {
        let s = setup();
        // Alice seeds the pool.
        s.pool.add_liquidity(&s.alice, &1_000_0000000i128, &4_000_0000000i128);
        let total_after_alice = s.lp.total_supply();

        // Bob deposits exactly half Alice's amounts → should get half the shares.
        let shares_bob = s.pool.add_liquidity(&s.bob, &500_0000000i128, &2_000_0000000i128);
        assert_eq!(shares_bob, total_after_alice / 2);
    }

    // ── Test 3: Swap matches constant-product formula exactly ─────────────────

    #[test]
    fn test_swap_constant_product_formula() {
        let s = setup();
        s.pool.add_liquidity(&s.alice, &1_000_0000000i128, &4_000_0000000i128);

        let amount_in = 100_0000000i128; // 100 XLM in
        let fee_bps = 30i128;
        let amount_in_fee = amount_in * (10_000 - fee_bps) / 10_000;
        let res_t = 1_000_0000000i128;
        let res_x = 4_000_0000000i128;
        let expected_out = (res_t * amount_in_fee) / (res_x + amount_in_fee);

        let actual_out = s.pool.swap(&s.bob, &amount_in, &0i128, &true);
        assert_eq!(actual_out, expected_out);
    }

    // ── Test 4: Swap rejects output below min_amount_out (slippage guard) ────

    #[test]
    #[should_panic(expected = "slippage: output below minimum")]
    fn test_swap_slippage_protection() {
        let s = setup();
        s.pool.add_liquidity(&s.alice, &1_000_0000000i128, &4_000_0000000i128);

        // Demand an unreasonably high min_out that can never be satisfied.
        s.pool.swap(&s.bob, &100_0000000i128, &999_999_0000000i128, &true);
    }

    // ── Test 5: remove_liquidity returns proportional amounts ─────────────────

    #[test]
    fn test_remove_liquidity_proportional() {
        let s = setup();
        let token_in = 1_000_0000000i128;
        let xlm_in = 4_000_0000000i128;
        let shares = s.pool.add_liquidity(&s.alice, &token_in, &xlm_in);

        let (tok_out, xlm_out) = s.pool.remove_liquidity(&s.alice, &shares);

        // Entire pool withdrawn → should match what was put in.
        assert_eq!(tok_out, token_in);
        assert_eq!(xlm_out, xlm_in);
        let (rt, rx) = s.pool.get_reserves();
        assert_eq!(rt, 0);
        assert_eq!(rx, 0);
    }

    // ── Test 6: k = reserve_token × reserve_xlm never decreases after swaps ──

    #[test]
    fn test_reserves_invariant_across_swaps() {
        let s = setup();
        s.pool.add_liquidity(&s.alice, &1_000_0000000i128, &4_000_0000000i128);

        let (rt0, rx0) = s.pool.get_reserves();
        let k0 = rt0 * rx0;

        // Perform several swaps and check k only grows (fees accumulate).
        for _ in 0..5 {
            s.pool.swap(&s.bob, &10_0000000i128, &0i128, &true);
        }
        for _ in 0..5 {
            s.pool.swap(&s.bob, &1_0000000i128, &0i128, &false);
        }

        let (rt1, rx1) = s.pool.get_reserves();
        let k1 = rt1 * rx1;

        assert!(k1 >= k0, "invariant violated: k decreased after swaps");
    }
}
