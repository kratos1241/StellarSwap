"use client";

import { useState, useMemo } from "react";
import { usePoolState, useTokenBalance, useXlmBalance } from "@/hooks/usePool";
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

type Direction = "token_to_xlm" | "xlm_to_token";

const FEE_BPS = 30;

export default function SwapInterface({ address }: Props) {
  const { data: pool } = usePoolState();
  const { data: tokenBal, mutate: refetchToken } = useTokenBalance(address);
  const { data: xlmBal, mutate: refetchXlm } = useXlmBalance(address);

  const [dir, setDir] = useState<Direction>("xlm_to_token");
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: "idle" });

  const amountInNum = parseFloat(amountIn) || 0;
  const slippagePct = parseFloat(slippage) || 0.5;

  const estimatedOut = useMemo(() => {
    if (!pool || amountInNum <= 0) return 0;
    const rt = Number(pool.reserveToken) / 1e7;
    const rx = Number(pool.reserveXlm) / 1e7;
    if (rt === 0 || rx === 0) return 0;
    const dxFee = amountInNum * (1 - FEE_BPS / 10_000);
    const [resIn, resOut] = dir === "xlm_to_token" ? [rx, rt] : [rt, rx];
    return (resOut * dxFee) / (resIn + dxFee);
  }, [pool, amountInNum, dir]);

  const minOut = estimatedOut * (1 - slippagePct / 100);
  const inLabel = dir === "xlm_to_token" ? "XLM" : "TKN";
  const outLabel = dir === "xlm_to_token" ? "TKN" : "XLM";
  const inBal = dir === "xlm_to_token" ? xlmBal : tokenBal;

  const insufficientBalance =
    inBal !== undefined && amountInNum > 0 && amountInNum * 1e7 > Number(inBal);

  async function handleSwap() {
    if (!address || !amountInNum) return;
    setTxStatus({ state: "pending" });
    try {
      const amountInRaw = BigInt(Math.round(amountInNum * 1e7));
      const minOutRaw = BigInt(Math.round(minOut * 1e7));
      const tokenInIsXlm = dir === "xlm_to_token";

      const account = new Account(address, "0");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: CONTRACT_ADDRESSES.pool,
            function: "swap",
            args: [
              new Address(address).toScVal(),
              nativeToScVal(amountInRaw, { type: "i128" }),
              nativeToScVal(minOutRaw, { type: "i128" }),
              nativeToScVal(tokenInIsXlm, { type: "bool" }),
            ],
          })
        )
        .setTimeout(30)
        .build();

      const hash = await simulateAndSend(
        tx.toXDR(),
        (xdr) => signTransaction(xdr, address)
      );
      setTxStatus({ state: "success", hash });
      setAmountIn("");
      refetchToken();
      refetchXlm();
    } catch (e: unknown) {
      setTxStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Swap</h2>
        <span className="text-xs text-ink-muted bg-paper-warm border border-paper-border rounded px-2 py-1 num">
          Fee {(FEE_BPS / 100).toFixed(2)}%
        </span>
      </div>

      {/* Direction toggle */}
      <div className="flex gap-2">
        <button
          className={`tab ${dir === "xlm_to_token" ? "active" : ""}`}
          onClick={() => setDir("xlm_to_token")}
        >
          XLM → TKN
        </button>
        <button
          className={`tab ${dir === "token_to_xlm" ? "active" : ""}`}
          onClick={() => setDir("token_to_xlm")}
        >
          TKN → XLM
        </button>
      </div>

      {/* Input */}
      <div>
        <div className="flex justify-between text-xs text-ink-muted mb-1">
          <span>You pay ({inLabel})</span>
          {inBal !== undefined && (
            <button
              className="underline"
              onClick={() => setAmountIn((Number(inBal) / 1e7).toFixed(7))}
            >
              Max: {(Number(inBal) / 1e7).toFixed(4)}
            </button>
          )}
        </div>
        <input
          type="number"
          min="0"
          step="0.0000001"
          className="input"
          placeholder="0.0000000"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
        />
        {insufficientBalance && (
          <p className="text-xs text-danger mt-1">Insufficient {inLabel} balance.</p>
        )}
      </div>

      {/* Output estimate */}
      <div>
        <p className="text-xs text-ink-muted mb-1">You receive (estimated {outLabel})</p>
        <div className="input cursor-default text-ink num">
          {estimatedOut > 0 ? estimatedOut.toFixed(7) : "—"}
        </div>
        {estimatedOut > 0 && (
          <p className="text-xs text-ink-muted mt-1 num">
            Min received: {minOut.toFixed(7)} {outLabel}
          </p>
        )}
      </div>

      {/* Slippage */}
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span>Slippage tolerance:</span>
        {["0.1", "0.5", "1.0"].map((v) => (
          <button
            key={v}
            className={`tab text-xs py-1 px-2 ${slippage === v ? "active" : ""}`}
            onClick={() => setSlippage(v)}
          >
            {v}%
          </button>
        ))}
        <input
          type="number"
          className="input w-16 text-xs py-1"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
        />
      </div>

      <button
        className="btn-primary w-full"
        disabled={!address || !amountInNum || insufficientBalance || txStatus.state === "pending"}
        onClick={handleSwap}
      >
        {!address ? "Connect wallet to swap" : txStatus.state === "pending" ? "Swapping…" : "Swap"}
      </button>

      <TransactionFeedback status={txStatus} onDismiss={() => setTxStatus({ state: "idle" })} />
    </div>
  );
}
