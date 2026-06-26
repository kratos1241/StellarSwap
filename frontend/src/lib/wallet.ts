"use client";

import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  FreighterModule,
} from "@creit.tech/stellar-wallets-kit";
import { NETWORK } from "./contracts";

let _kit: StellarWalletsKit | null = null;

export function getWalletsKit(): StellarWalletsKit {
  if (!_kit) {
    _kit = new StellarWalletsKit({
      network: NETWORK === "mainnet" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule()],
    });
  }
  return _kit;
}

export async function connectWallet(): Promise<string> {
  const kit = getWalletsKit();
  await kit.openModal({
    onWalletSelected: async (option) => {
      kit.setWallet(option.id);
    },
  });
  const { address } = await kit.getAddress();
  return address;
}

export async function signTransaction(xdr: string, publicKey: string): Promise<string> {
  const kit = getWalletsKit();
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    address: publicKey,
    networkPassphrase:
      NETWORK === "mainnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015",
  });
  return signedTxXdr;
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
