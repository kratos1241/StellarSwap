"use client";

import { useState } from "react";
import { usePoolState, useTokenBalance, useXlmBalance, useLpBalance } from "@/hooks/usePool";
import TransactionFeedback, { TxStatus } from "./TransactionFeedback";
import { CONTRACT_ADDRESSES, simulateAndSend } from "@/lib/contracts";
import { signTransaction } from "@/lib/wallet";
import {
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Operation,
  nativeToScVal,
  Address,
  Account,
} from "@stellar/stellar-sdk";

interface Props {
  address: string | null;
}

export default function LiquidityPanel({ address }: Props) {
  const { data: pool, mutate: refetchPool } = usePoolState();
  const { data: tokenBal, mutate: refetchToken } = useTokenBalance(address);
  const { data: xlmBal, mutate: refetchXlm } = useXlmBalance(address);
  const { data: lpBal, mutate: refetchLp } = useLpBalance(address);

  const [tab, setTab] = useState<"add" | "remove">("add");
  const [tokenAmt, setTokenAmt] = useState("");
  const [xlmAmt, setXlmAmt] = useState("");
  const [removePct, setRemovePct] = useState("100");
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: "idle" });

  const resT = pool ? Number(pool.reserveToken) / 1e7 : 0;
  const resX = pool ? Number(pool.reserveXlm) / 1e7 : 0;
  const ratio = resT > 0 ? resX / resT : 0;

  function syncXlm(tok: string) {
    setTokenAmt(tok);
    const t = parseFloat(tok) || 0;
    if (ratio > 0) setXlmAmt((t * ratio).toFixed(7));
  }
  function syncToken(xlm: string) {
    setXlmAmt(xlm);
    const x = parseFloat(xlm) || 0;
    if (ratio > 0) setTokenAmt(ratio > 0 ? (x / ratio).toFixed(7) : "");
  }

  // ── Add liquidity ────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!address) return;
    const tAmt = parseFloat(tokenAmt);
    const xAmt = parseFloat(xlmAmt);
    if (!tAmt || !xAmt) return;
    setTxStatus({ state: "pending" });
    try {
      const account = new Account(address, "0");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: CONTRACT_ADDRESSES.pool,
            function: "add_liquidity",
            args: [
              new Address(address).toScVal(),
              nativeToScVal(BigInt(Math.round(tAmt * 1e7)), { type: "i128" }),
              nativeToScVal(BigInt(Math.round(xAmt * 1e7)), { type: "i128" }),
            ],
          })
        )
        .setTimeout(30)
        .build();
      const hash = await simulateAndSend(tx.toXDR(), (xdr) => signTransaction(xdr, address));
      setTxStatus({ state: "success", hash });
      setTokenAmt(""); setXlmAmt("");
      refetchToken(); refetchXlm(); refetchLp(); refetchPool();
    } catch (e: unknown) {
      setTxStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── Remove liquidity ─────────────────────────────────────────────────────

  async function handleRemove() {
    if (!address || !lpBal) return;
    const pct = parseFloat(removePct) / 100;
    const sharesToBurn = BigInt(Math.round(Number(lpBal) * pct));
    if (sharesToBurn <= 0n) return;
    setTxStatus({ state: "pending" });
    try {
      const account = new Account(address, "0");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: CONTRACT_ADDRESSES.pool,
            function: "remove_liquidity",
            args: [
              new Address(address).toScVal(),
              nativeToScVal(sharesToBurn, { type: "i128" }),
            ],
          })
        )
        .setTimeout(30)
        .build();
      const hash = await simulateAndSend(tx.toXDR(), (xdr) => signTransaction(xdr, address));
      setTxStatus({ state: "success", hash });
      refetchToken(); refetchXlm(); refetchLp(); refetchPool();
    } catch (e: unknown) {
      setTxStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const lpVal =
    lpBal && pool && pool.reserveToken > 0n
      ? ((Number(lpBal) / 1e7) * resX * 2).toFixed(2)
      : "—";

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-ink">Liquidity</h2>

      {/* Your position */}
      {lpBal !== undefined && (
        <div className="bg-paper-warm border border-paper-border rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-ink-muted">Your LP shares</span>
            <span className="num">{(Number(lpBal) / 1e7).toFixed(7)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Estimated value</span>
            <span className="num">{lpVal} XLM equiv.</span>
          </div>
        </div>
      )}

      {/* Tab */}
      <div className="flex gap-2">
        <button className={`tab ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
          Add
        </button>
        <button className={`tab ${tab === "remove" ? "active" : ""}`} onClick={() => setTab("remove")}>
          Remove
        </button>
      </div>

      {tab === "add" ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-ink-muted mb-1">TKN amount</p>
            <input className="input" type="number" placeholder="0.0000000" value={tokenAmt}
              onChange={(e) => syncXlm(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-ink-muted mb-1">XLM amount (auto-balanced)</p>
            <input className="input" type="number" placeholder="0.0000000" value={xlmAmt}
              onChange={(e) => syncToken(e.target.value)} />
          </div>
          <button
            className="btn-primary w-full"
            disabled={!address || !tokenAmt || !xlmAmt || txStatus.state === "pending"}
            onClick={handleAdd}
          >
            {!address ? "Connect wallet" : txStatus.state === "pending" ? "Adding…" : "Add Liquidity"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-ink-muted mb-1">Remove %</p>
            <div className="flex gap-2 mb-2">
              {["25", "50", "75", "100"].map((v) => (
                <button key={v} className={`tab text-xs py-1 px-2 ${removePct === v ? "active" : ""}`}
                  onClick={() => setRemovePct(v)}>
                  {v}%
                </button>
              ))}
            </div>
            <input className="input" type="number" min="1" max="100"
              value={removePct} onChange={(e) => setRemovePct(e.target.value)} />
          </div>
          <button
            className="btn-primary w-full"
            disabled={!address || !lpBal || txStatus.state === "pending"}
            onClick={handleRemove}
          >
            {!address ? "Connect wallet" : txStatus.state === "pending" ? "Removing…" : "Remove Liquidity"}
          </button>
        </div>
      )}

      <TransactionFeedback status={txStatus} onDismiss={() => setTxStatus({ state: "idle" })} />
    </div>
  );
}
