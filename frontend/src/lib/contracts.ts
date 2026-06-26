import { SorobanRpc, TransactionBuilder, Networks, BASE_FEE, xdr } from "@stellar/stellar-sdk";

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

// TKN classic asset (issued on Stellar, wrapped as the SAC in CONTRACT_ADDRESSES.token).
export const TKN_ASSET = {
  code: process.env.NEXT_PUBLIC_TKN_ASSET_CODE ?? "TKN",
  issuer: process.env.NEXT_PUBLIC_TKN_ISSUER ?? "",
} as const;

export const NETWORK_PASSPHRASE =
  NETWORK === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

export const CONTRACT_ADDRESSES = {
  token:   process.env.NEXT_PUBLIC_TOKEN_CONTRACT   ?? "",
  xlm:     process.env.NEXT_PUBLIC_XLM_SAC_CONTRACT ?? "",
  lpShare: process.env.NEXT_PUBLIC_LP_SHARE_CONTRACT ?? "",
  pool:    process.env.NEXT_PUBLIC_POOL_CONTRACT     ?? "",
} as const;

export const STELLAR_EXPERT_BASE =
  NETWORK === "testnet"
    ? "https://stellar.expert/explorer/testnet"
    : "https://stellar.expert/explorer/public";

export function txExpertUrl(hash: string) {
  return `${STELLAR_EXPERT_BASE}/tx/${hash}`;
}

export function contractExpertUrl(addr: string) {
  return `${STELLAR_EXPERT_BASE}/contract/${addr}`;
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

export function getRpc() {
  return new SorobanRpc.Server(RPC_URL, { allowHttp: false });
}

/** Best-effort stringify of an RPC sendTransaction errorResult XDR. */
function describeSendError(errorResult: unknown): string {
  try {
    const r = errorResult as { result?: () => { switch?: () => { name?: string } } };
    const name = r?.result?.()?.switch?.()?.name;
    if (name) return name;
  } catch {
    /* fall through */
  }
  if (typeof errorResult === "string") return errorResult;
  try {
    return JSON.stringify(errorResult);
  } catch {
    return "unknown submission error";
  }
}

/**
 * Confirm a transaction via Horizon's JSON API (returns `successful: bool`).
 *
 * We deliberately avoid the RPC's `getTransaction`, which decodes the result-meta
 * XDR client-side: an older `stellar-sdk` against a newer testnet protocol throws
 * "Bad union switch" on an unrecognized XDR variant even when the tx succeeded.
 * Horizon hands back plain JSON, so there's no client-side XDR decode to break.
 */
async function confirmViaHorizon(hash: string): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${HORIZON_URL}/transactions/${hash}`);
      if (res.status === 200) {
        const data = (await res.json()) as { successful?: boolean };
        return data.successful === true;
      }
      // 404 → not yet ingested; keep polling.
    } catch {
      /* transient network error — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error("Timed out waiting for confirmation.");
}

/**
 * Build a Soroban transaction from a single operation using the SOURCE ACCOUNT'S
 * REAL on-chain sequence number, simulate it, have it signed, submit, and confirm.
 *
 * Fetching the live sequence (via `rpc.getAccount`) is what makes submission work —
 * a hardcoded sequence of "0" simulates fine but is rejected on submit as tx_bad_seq.
 */
export async function invokeContract(
  sourceAddress: string,
  operation: xdr.Operation,
  signFn: (xdr: string) => Promise<string>
): Promise<string> {
  const rpc = getRpc();

  // Real sequence number — the critical fix.
  const account = await rpc.getAccount(sourceAddress);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const simResult = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(simResult.error);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await signFn(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

  // Compute the hash locally so we can confirm via Horizon even if the RPC
  // response decode hiccups on a protocol/XDR mismatch.
  const txHash = signed.hash().toString("hex");

  try {
    const sent = await rpc.sendTransaction(signed);
    if (sent.status === "ERROR") {
      throw new Error(`Submission failed: ${describeSendError(sent.errorResult)}`);
    }
  } catch (e: unknown) {
    // A genuine submission failure should surface; an XDR-decode hiccup in the
    // RPC response should not — the tx may still have landed, so fall through to
    // Horizon confirmation by hash.
    if (e instanceof Error && e.message.startsWith("Submission failed")) throw e;
  }

  const ok = await confirmViaHorizon(txHash);
  if (ok) return txHash;
  throw new Error("Transaction failed on-chain.");
}
