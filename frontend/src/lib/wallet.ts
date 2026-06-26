"use client";

// v2 API: all methods are static on StellarWalletsKit; modules are subpath imports.
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID, FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { NETWORK } from "./contracts";

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  StellarWalletsKit.init({
    network: NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
    selectedWalletId: FREIGHTER_ID,
    modules: [new FreighterModule()],
  });
  _initialized = true;
}

export async function connectWallet(): Promise<string> {
  ensureInit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

export async function signTransaction(xdr: string, _publicKey: string): Promise<string> {
  ensureInit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase:
      NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
  });
  return signedTxXdr;
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
