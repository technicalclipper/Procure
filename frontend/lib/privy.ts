/**
 * Privy server-wallet client.
 *
 * Thin REST wrapper rather than the SDK, because the Arc path has two
 * non-obvious requirements that we verified empirically (2026-09-09):
 *
 *  1. Privy will NOT broadcast to Arc:
 *       eth_sendTransaction + caip2 "eip155:5042002"
 *       -> 401 "App is not authorized to transact on chain"
 *     A control call on Base Sepolia reached broadcast, so this is a
 *     per-chain authorization, not a bad request.
 *
 *  2. Privy WILL sign for Arc, and the policy engine still evaluates:
 *       eth_signTransaction with chain_id inside the transaction
 *       (it rejects a `caip2` key) -> 200, returns signed RLP.
 *       With a policy attached, a disallowed recipient returns
 *       400 "RPC request denied due to policy violation".
 *
 * So the payment path is: Privy signs (policy-enforced) -> we broadcast to
 * Arc ourselves. Both control layers stay intact; we just own the RPC.
 */

const BASE = "https://api.privy.io";

function credentials() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) {
    throw new Error(
      "Privy credentials missing — set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET",
    );
  }
  // Dashboard copy-paste can carry invisible characters (we lost an hour to a
  // trailing U+2028, which presents as a flat 401). Strip defensively.
  const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, "").trim();
  return { appId: clean(appId), secret: clean(secret) };
}

async function privy<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const { appId, secret } = credentials();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${appId}:${secret}`).toString("base64"),
      "privy-app-id": appId,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : text.slice(0, 300);
    throw new Error(`Privy ${method} ${path} -> ${res.status}: ${message}`);
  }
  return payload as T;
}

export type PrivyWallet = {
  id: string;
  address: string;
  chain_type: string;
  policy_ids: string[];
  additional_signers: unknown[];
  created_at: number;
};

/** Create an EVM server wallet. Chain is chosen per-transaction, not here. */
export function createWallet(): Promise<PrivyWallet> {
  return privy<PrivyWallet>("POST", "/v1/wallets", { chain_type: "ethereum" });
}

export function getWallet(walletId: string): Promise<PrivyWallet> {
  return privy<PrivyWallet>("GET", `/v1/wallets/${walletId}`);
}

export function attachPolicies(
  walletId: string,
  policyIds: string[],
): Promise<PrivyWallet> {
  return privy<PrivyWallet>("PATCH", `/v1/wallets/${walletId}`, {
    policy_ids: policyIds,
  });
}

export type PrivyPolicy = { id: string; name: string };

/**
 * Create a policy.
 *
 * Gotchas found the hard way:
 *  - there is no `default_action` key; anything with no matching ALLOW is denied
 *  - rules must target "eth_signTransaction" to gate OUR path — a rule scoped
 *    to eth_sendTransaction never fires, since we never call it
 *  - attach using the TOP-LEVEL policy id, not the nested rule id
 */
export function createPolicy(input: {
  name: string;
  rules: unknown[];
}): Promise<PrivyPolicy> {
  return privy<PrivyPolicy>("POST", "/v1/policies", {
    version: "1.0",
    name: input.name,
    chain_type: "ethereum",
    rules: input.rules,
  });
}

/**
 * Sign a transaction for Arc. Returns signed RLP for us to broadcast.
 * Note: `chain_id` goes INSIDE the transaction — a top-level `caip2` key
 * is rejected by this method.
 */
export async function signTransaction(
  walletId: string,
  transaction: {
    to: string;
    value?: string;
    data?: string;
    chain_id: number;
    nonce: number;
    gas_limit: number | string;
    max_fee_per_gas: string;
    max_priority_fee_per_gas: string;
    type?: number;
  },
): Promise<`0x${string}`> {
  const out = await privy<{
    method: string;
    data: { signed_transaction: string; encoding: string };
  }>("POST", `/v1/wallets/${walletId}/rpc`, {
    method: "eth_signTransaction",
    params: { transaction: { type: 2, ...transaction } },
  });
  return out.data.signed_transaction as `0x${string}`;
}
