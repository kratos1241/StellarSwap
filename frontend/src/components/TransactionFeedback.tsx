"use client";

import { txExpertUrl } from "@/lib/contracts";

export type TxStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; hash: string }
  | { state: "error"; message: string };

interface Props {
  status: TxStatus;
  onDismiss: () => void;
}

export default function TransactionFeedback({ status, onDismiss }: Props) {
  if (status.state === "idle") return null;

  const base = "mt-3 rounded-lg p-3 text-sm flex items-start gap-2";

  if (status.state === "pending") {
    return (
      <div className={`${base} bg-amber-light border border-amber/30 text-amber-dark`}>
        <svg className="mt-0.5 shrink-0 animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 6" />
        </svg>
        <span>Transaction pending…</span>
      </div>
    );
  }

  if (status.state === "success") {
    return (
      <div className={`${base} bg-green-50 border border-success/30 text-success`}>
        <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <div className="flex-1">
          Transaction confirmed.{" "}
          <a
            href={txExpertUrl(status.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-xs"
          >
            {status.hash.slice(0, 8)}…{status.hash.slice(-6)}
          </a>
          <button onClick={onDismiss} className="ml-3 text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      </div>
    );
  }

  // error
  const humanMsg = friendlyError(status.message);
  return (
    <div className={`${base} bg-red-50 border border-danger/30 text-danger`}>
      <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 2v6M7 10v1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      <div className="flex-1">
        {humanMsg}
        <button onClick={onDismiss} className="ml-3 text-xs opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("reject") || m.includes("denied"))
    return "Signature request was rejected.";
  if (m.includes("not installed") || m.includes("not found"))
    return "Wallet not found — please install Freighter.";
  if (m.includes("slippage") || m.includes("below minimum"))
    return "Slippage too high — output would be below your minimum. Try raising your slippage tolerance.";
  // SAC "resulting balance is not within the allowed range" → trying to move tokens you don't have.
  if (m.includes("resulting balance is not within the allowed range") || m.includes("balance is not within"))
    return "Insufficient token balance — you don't hold enough TKN/XLM for this. Swap for some TKN first.";
  if (m.includes("insufficient balance") || m.includes("insufficient_balance"))
    return "Insufficient balance for this transaction.";
  if (m.includes("trustline") || m.includes("no trust"))
    return "Missing TKN trustline — add it from the banner above first.";
  if (m.includes("tx_bad_seq") || m.includes("badseq"))
    return "Transaction sequence was stale — please try again.";
  if (m.includes("error(contract, #10)") || m.includes("contract, #10"))
    return "Insufficient token balance for this transaction.";
  // Keep contract panic strings readable but trimmed.
  if (m.includes("escalating error") || m.includes("vm trap"))
    return "The contract rejected this transaction (check balances and amounts).";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
