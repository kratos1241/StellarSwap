"use client";

import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import SwapInterface from "@/components/SwapInterface";
import LiquidityPanel from "@/components/LiquidityPanel";
import PoolStats from "@/components/PoolStats";
import ActivityFeed from "@/components/ActivityFeed";

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-paper">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-paper-border bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Logo mark */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke="#E8A020" strokeWidth="1.5" />
              <path d="M7 11h8M11 7l4 4-4 4" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold text-ink tracking-tight">StellarSwap</span>
            <span className="hidden sm:inline text-xs text-ink-muted border border-paper-border rounded px-1.5 py-0.5">
              Testnet
            </span>
          </div>
          <WalletConnect
            address={address}
            onConnect={setAddress}
            onDisconnect={() => setAddress(null)}
          />
        </div>
      </header>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Hero label */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            TKN / XLM Pool
          </h1>
          <p className="text-sm text-ink-muted">
            Constant-product AMM with 0.30% fee — swap tokens or provide liquidity to earn fees.
          </p>
        </div>

        {/* ── Primary 2-col: swap + liquidity ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SwapInterface address={address} />
          <LiquidityPanel address={address} />
        </div>

        {/* ── Pool stats (full width) ───────────────────────────────────── */}
        <PoolStats />

        {/* ── Activity feed ────────────────────────────────────────────── */}
        <ActivityFeed />

        {/* ── Wallet not connected nudge ────────────────────────────────── */}
        {!address && (
          <div className="text-center py-8 text-ink-muted text-sm">
            Connect your Freighter wallet to swap or add liquidity.
          </div>
        )}
      </main>

      <footer className="border-t border-paper-border mt-12 py-6 text-center text-xs text-ink-muted">
        StellarSwap · Soroban Testnet · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
