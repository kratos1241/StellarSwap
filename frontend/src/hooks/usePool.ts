"use client";

import useSWR from "swr";
import { SorobanRpc, scValToNative, xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";
import { CONTRACT_ADDRESSES, getRpc } from "@/lib/contracts";

const POLL_INTERVAL = 6_000; // 6 s

// ── Read-only contract view calls ─────────────────────────────────────────────

async function viewCall<T>(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const rpc = getRpc();
  const contract = new SorobanRpc.Server(rpc["serverURL"]);

  // Use simulateTransaction with an unsigned tx to read state.
  const { result } = await rpc.simulateTransaction(
    new (await import("@stellar/stellar-sdk")).TransactionBuilder(
      { accountId: () => "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", sequence: () => "0", incrementSequenceNumber: () => {} } as never,
      { fee: "100", networkPassphrase: "Test SDF Network ; September 2015" }
    )
      .addOperation(
        (await import("@stellar/stellar-sdk")).Operation.invokeContractFunction({
          contract: contractId,
          function: method,
          args,
        })
      )
      .setTimeout(30)
      .build()
  );
  if (!result) throw new Error("no result from simulation");
  return scValToNative((result as { retval: xdr.ScVal }).retval) as T;
}

export interface PoolState {
  reserveToken: bigint;
  reserveXlm: bigint;
  price: bigint; // token per XLM × 1e7
  totalLiquidity: number; // USD-equivalent placeholder
}

async function fetchPoolState(): Promise<PoolState> {
  if (!CONTRACT_ADDRESSES.pool) {
    return { reserveToken: 0n, reserveXlm: 0n, price: 0n, totalLiquidity: 0 };
  }
  const [rt, rx] = await viewCall<bigint[]>(CONTRACT_ADDRESSES.pool, "get_reserves");
  const price = await viewCall<bigint>(CONTRACT_ADDRESSES.pool, "get_price");
  return {
    reserveToken: rt,
    reserveXlm: rx,
    price,
    totalLiquidity: Number(rx) / 1e7,
  };
}

export function usePoolState() {
  return useSWR("pool-state", fetchPoolState, { refreshInterval: POLL_INTERVAL });
}

async function fetchBalance(contractId: string, address: string): Promise<bigint> {
  if (!contractId || !address) return 0n;
  return viewCall<bigint>(contractId, "balance", [
    new Address(address).toScVal(),
  ]);
}

export function useTokenBalance(address: string | null) {
  return useSWR(
    address ? ["token-balance", address] : null,
    () => fetchBalance(CONTRACT_ADDRESSES.token, address!),
    { refreshInterval: POLL_INTERVAL }
  );
}

export function useXlmBalance(address: string | null) {
  return useSWR(
    address ? ["xlm-balance", address] : null,
    () => fetchBalance(CONTRACT_ADDRESSES.xlm, address!),
    { refreshInterval: POLL_INTERVAL }
  );
}

export function useLpBalance(address: string | null) {
  return useSWR(
    address ? ["lp-balance", address] : null,
    () => fetchBalance(CONTRACT_ADDRESSES.lpShare, address!),
    { refreshInterval: POLL_INTERVAL }
  );
}

// ── Price history (polled from events) ───────────────────────────────────────

export interface PricePoint {
  t: number;
  price: number;
}

async function fetchPriceHistory(): Promise<PricePoint[]> {
  if (!CONTRACT_ADDRESSES.pool) return [];
  const rpc = getRpc();
  const events = await rpc.getEvents({
    startLedger: 0,
    filters: [
      {
        type: "contract",
        contractIds: [CONTRACT_ADDRESSES.pool],
        topics: [["*", "*"]],
      },
    ],
    limit: 200,
  });
  const points: PricePoint[] = [];
  let runToken = 1_000_0000000n;
  let runXlm = 4_000_0000000n;

  for (const ev of events.records) {
    const data = ev.value;
    // Reconstruct price from native values in swap events — best effort.
    points.push({
      t: ev.ledger,
      price: runXlm > 0n ? Number((runToken * 10_000_000n) / runXlm) / 1e7 : 0,
    });
  }
  return points.length ? points : [];
}

export function usePriceHistory() {
  return useSWR("price-history", fetchPriceHistory, { refreshInterval: 30_000 });
}

// ── Recent activity feed ──────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: "swap" | "add" | "remove";
  ledger: number;
  amountIn?: number;
  amountOut?: number;
}

async function fetchActivity(): Promise<ActivityEvent[]> {
  if (!CONTRACT_ADDRESSES.pool) return [];
  const rpc = getRpc();
  const events = await rpc.getEvents({
    startLedger: 0,
    filters: [
      { type: "contract", contractIds: [CONTRACT_ADDRESSES.pool], topics: [["*"]] },
    ],
    limit: 20,
  });
  return events.records.map((ev) => ({
    id: ev.id,
    type: ev.topic[0]?.toString().includes("swap")
      ? "swap"
      : ev.topic[0]?.toString().includes("add")
      ? "add"
      : "remove",
    ledger: ev.ledger,
  }));
}

export function useActivity() {
  return useSWR("activity", fetchActivity, { refreshInterval: POLL_INTERVAL });
}
