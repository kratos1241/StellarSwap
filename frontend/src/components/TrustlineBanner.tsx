"use client";

import { useState, useEffect, useCallback } from "react";
import { checkTrustline, addTrustline, TrustlineState } from "@/lib/trustline";
import { txExpertUrl, TKN_ASSET } from "@/lib/contracts";

interface Props {
  address: string | null;
  /** Called after a trustline is successfully established (e.g. to refetch balances). */
  onEstablished?: () => void;
}

export default function TrustlineBanner({ address, onEstablished }: Props) {
  const [state, setState] = useState<TrustlineState>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setState(await checkTrustline(address));
  }, [address]);

  useEffect(() => {
    setError(null);
    setHash(null);
    if (address) refresh();
    else setState("unknown");
  }, [address, refresh]);

  async function handleAdd() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const h = await addTrustline(address);
      setHash(h);
      setState("established");
      onEstablished?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
        setError("Signature request was rejected.");
      } else if (msg.toLowerCase().includes("underfunded") || msg.toLowerCase().includes("low reserve") || msg.includes("tx_insufficient_balance")) {
        setError("Not enough XLM to cover the trustline reserve (~0.5 XLM). Fund the wallet first.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  // Don't render anything until we know there's a real gap to fill.
  if (!address || state === "established" || state === "unknown") return null;

  if (state === "no-account") {
    return (
      <div className="card border-amber/40 bg-amber-light/50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex-1 text-sm">
          <p className="font-medium text-ink">Account not funded yet</p>
          <p className="text-ink-muted">
            This wallet doesn&apos;t exist on testnet. Fund it with the{" "}
            <a
              className="underline"
              href={`https://friendbot.stellar.org?addr=${address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Friendbot
            </a>
            , then add the {TKN_ASSET.code} trustline.
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={refresh}>
          Re-check
        </button>
      </div>
    );
  }

  // state === "missing"
  return (
    <div className="card border-amber/40 bg-amber-light/50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 text-sm">
        <p className="font-medium text-ink">
          Add the {TKN_ASSET.code} trustline to your wallet
        </p>
        <p className="text-ink-muted">
          {TKN_ASSET.code} is a Stellar asset — your wallet needs a trustline before it can hold or
          receive it. This is a one-time, on-chain action.
        </p>
        {error && <p className="text-danger mt-1">{error}</p>}
        {hash && (
          <p className="text-success mt-1">
            Trustline added.{" "}
            <a className="underline font-mono text-xs" href={txExpertUrl(hash)} target="_blank" rel="noopener noreferrer">
              {hash.slice(0, 8)}…{hash.slice(-6)}
            </a>
          </p>
        )}
      </div>
      <button className="btn-primary text-sm whitespace-nowrap" disabled={busy} onClick={handleAdd}>
        {busy ? "Adding…" : `Add ${TKN_ASSET.code} Trustline`}
      </button>
    </div>
  );
}
