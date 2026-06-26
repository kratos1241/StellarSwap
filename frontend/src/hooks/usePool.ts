"use client";

import useSWR from "swr";
import {
  SorobanRpc,
  scValToNative,
  xdr,
  Address,
  TransactionBuilder,
  Account,
  Networks,
  Operation,
} from "@stellar/stellar-sdk";
import { CONTRACT_ADDRESSES, getRpc } from "@/lib/contracts";

const POLL_INTERVAL = 6_000;
const DUMMY_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ── Generic read-only simulation ───────────────────────────────────────────────

async function viewCall<T>(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const rpc = getRpc();
  const account = new Account(DUMMY_ACCOUNT, "0");
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      })
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation error: ${(sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error}`);
  }
  const success = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  if (!success.result) throw new Error("no result from simulation");
  return scValToNative(success.result.retval) as T;
}

// ── Pool state ─────────────────────────────────────────────────────────────────

export interface PoolState {
  reserveToken: bigint;
  reserveXlm: bigint;
  price: bigint;
  totalLiquidity: number;
}

async function fetchPoolState(): Promise<PoolState> {
  if (!CONTRACT_ADDRESSES.pool) {
    return { reserveToken: 0n, reserveXlm: 0n, price: 0n, totalLiquidity: 0 };
  }
  const reserves = await viewCall<[bigint, bigint]>(CONTRACT_ADDRESSES.pool, "get_reserves");
  const [rt, rx] = reserves;
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

// ── Balances ───────────────────────────────────────────────────────────────────

async function fetchBalance(contractId: string, address: string): Promise<bigint> {
  if (!contractId || !address) return 0n;
  return viewCall<bigint>(contractId, "balance", [new Address(address).toScVal()]);
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

// ── Price history from events ──────────────────────────────────────────────────

export interface PricePoint {
  t: number;
  price: number;
}

async function fetchPriceHistory(): Promise<PricePoint[]> {
  if (!CONTRACT_ADDRESSES.pool) return [];
  const rpc = getRpc();
  const eventsResp = await rpc.getEvents({
    startLedger: 0,
    filters: [
      {
        type: "contract",
        contractIds: [CONTRACT_ADDRESSES.pool],
        topics: [["*"]],
      },
    ],
    limit: 200,
  });
  const events = (eventsResp as SorobanRpc.Api.GetEventsResponse).events ?? [];
  const points: PricePoint[] = events.map((ev: SorobanRpc.Api.EventResponse) => ({
    t: ev.ledger,
    price: 0, // Would be reconstructed from reserve changes in a full implementation
  }));
  return points;
}

export function usePriceHistory() {
  return useSWR("price-history", fetchPriceHistory, { refreshInterval: 30_000 });
}

// ── Activity feed ──────────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: "swap" | "add" | "remove";
  ledger: number;
}

async function fetchActivity(): Promise<ActivityEvent[]> {
  if (!CONTRACT_ADDRESSES.pool) return [];
  const rpc = getRpc();
  const eventsResp = await rpc.getEvents({
    startLedger: 0,
    filters: [
      { type: "contract", contractIds: [CONTRACT_ADDRESSES.pool], topics: [["*"]] },
    ],
    limit: 20,
  });
  const events = (eventsResp as SorobanRpc.Api.GetEventsResponse).events ?? [];
  return events.map((ev: SorobanRpc.Api.EventResponse) => {
    const topic0 = ev.topic[0] ? scValToNative(ev.topic[0]) : "";
    const t0 = String(topic0);
    return {
      id: ev.id,
      type: t0.includes("swap") ? "swap" : t0.includes("add") || t0.includes("liq_add") ? "add" : "remove",
      ledger: ev.ledger,
    };
  });
}

export function useActivity() {
  return useSWR("activity", fetchActivity, { refreshInterval: POLL_INTERVAL });
}
