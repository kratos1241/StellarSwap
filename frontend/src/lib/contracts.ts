import { SorobanRpc, TransactionBuilder, Networks, BASE_FEE, xdr } from "@stellar/stellar-sdk";

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";

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

export async function simulateAndSend(
  xdrTx: string,
  signFn: (xdr: string) => Promise<string>
): Promise<string> {
  const rpc = getRpc();
  const tx = TransactionBuilder.fromXDR(xdrTx, Networks.TESTNET);
  const simResult = await rpc.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simResult.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await signFn(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

  const sent = await rpc.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(`Send error: ${sent.errorResult}`);

  // Poll for confirmation.
  let result = await rpc.getTransaction(sent.hash);
  for (let i = 0; i < 30 && result.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((r) => setTimeout(r, 1_000));
    result = await rpc.getTransaction(sent.hash);
  }

  if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return sent.hash;
  throw new Error(`Transaction failed: ${result.status}`);
}
