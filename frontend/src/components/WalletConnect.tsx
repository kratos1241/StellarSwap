"use client";

import { useState, useEffect } from "react";
import { connectWallet, truncateAddress } from "@/lib/wallet";
import { useTokenBalance, useXlmBalance } from "@/hooks/usePool";

interface Props {
  address: string | null;
  onConnect: (addr: string) => void;
  onDisconnect: () => void;
}

export default function WalletConnect({ address, onConnect, onDisconnect }: Props) {
  const { data: tokenBal } = useTokenBalance(address);
  const { data: xlmBal } = useXlmBalance(address);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const addr = await connectWallet();
      onConnect(addr);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("not installed") || msg.toLowerCase().includes("not found")) {
        setError("Wallet not found — please install Freighter.");
      } else if (msg.toLowerCase().includes("user") && msg.toLowerCase().includes("reject")) {
        setError("Signature request rejected.");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }

  function fmt(val: bigint | undefined) {
    if (val === undefined) return "—";
    return (Number(val) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end text-xs">
          <span className="num text-ink-soft">{fmt(tokenBal)} TKN</span>
          <span className="num text-ink-muted">{fmt(xlmBal)} XLM</span>
        </div>
        <div className="flex items-center gap-2 bg-paper-warm border border-paper-border rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <span className="font-mono text-sm text-ink">{truncateAddress(address)}</span>
        </div>
        <button onClick={onDisconnect} className="btn-secondary text-sm py-2">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handleConnect} disabled={connecting} className="btn-primary text-sm">
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
      {error && (
        <span className="text-xs text-danger mt-1">{error}</span>
      )}
    </div>
  );
}
