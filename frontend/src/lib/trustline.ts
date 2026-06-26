"use client";

import {
  Horizon,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE, TKN_ASSET } from "./contracts";
import { signTransaction } from "./wallet";

function horizon() {
  return new Horizon.Server(HORIZON_URL);
}

function tknAsset(): Asset {
  return new Asset(TKN_ASSET.code, TKN_ASSET.issuer);
}

export type TrustlineState = "missing" | "established" | "no-account" | "unknown";

/** Check whether `address` already trusts the TKN asset. */
export async function checkTrustline(address: string): Promise<TrustlineState> {
  if (!TKN_ASSET.issuer) return "unknown";
  try {
    const account = await horizon().loadAccount(address);
    const has = account.balances.some(
      (b) =>
        "asset_code" in b &&
        b.asset_code === TKN_ASSET.code &&
        "asset_issuer" in b &&
        b.asset_issuer === TKN_ASSET.issuer
    );
    return has ? "established" : "missing";
  } catch (e: unknown) {
    // 404 → the account isn't funded on-chain yet.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) return "no-account";
    return "unknown";
  }
}

/**
 * Build, sign (Freighter) and submit a classic `changeTrust` op so the wallet
 * can hold TKN. Returns the transaction hash.
 */
export async function addTrustline(address: string): Promise<string> {
  if (!TKN_ASSET.issuer) throw new Error("TKN asset issuer is not configured.");
  const server = horizon();
  const account = await server.loadAccount(address);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: tknAsset() }))
    .setTimeout(60)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), address);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await server.submitTransaction(signed as never);
  return result.hash;
}
