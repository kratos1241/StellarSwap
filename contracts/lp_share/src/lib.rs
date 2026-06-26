#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Balance(Address),
    TotalSupply,
    Pool,
    Initialized,
}

#[contract]
pub struct LpShareContract;

#[contractimpl]
impl LpShareContract {
    /// Must be called by the pool contract after deployment.
    /// Only the pool address is allowed to mint and burn.
    pub fn initialize(env: Env, pool: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        assert!(amount > 0, "amount must be positive");
        let pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        pool.require_auth();

        let bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(bal + amount));

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + amount));
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        assert!(amount > 0, "amount must be positive");
        let pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        pool.require_auth();

        let bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(from.clone()))
            .unwrap_or(0);
        assert!(bal >= amount, "insufficient lp balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(bal - amount));

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));
    }

    pub fn balance(env: Env, address: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(address))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, LpShareContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let pool = Address::generate(&env);
        let user = Address::generate(&env);
        let id = env.register_contract(None, LpShareContract);
        let client = LpShareContractClient::new(&env, &id);
        client.initialize(&pool);
        (env, client, pool, user)
    }

    #[test]
    fn test_mint_and_burn() {
        let (_env, client, _pool, user) = setup();
        client.mint(&user, &1000i128);
        assert_eq!(client.balance(&user), 1000i128);
        assert_eq!(client.total_supply(), 1000i128);
        client.burn(&user, &400i128);
        assert_eq!(client.balance(&user), 600i128);
        assert_eq!(client.total_supply(), 600i128);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize() {
        let (env, client, _pool, _user) = setup();
        let other = Address::generate(&env);
        client.initialize(&other);
    }
}
