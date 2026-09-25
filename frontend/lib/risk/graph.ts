/**
 * Token API client — Pinax, built on The Graph's Substreams/Firehose.
 *
 * Verified against the live API 2026-09-09:
 *   host      https://api.pinax.network
 *   auth      Authorization: Bearer <JWT>
 *   endpoints /v1/evm/transfers, /v1/evm/balances
 *   limit     10 items per request on the free tier (limit=100 -> 403)
 *   paging    ?page=N works
 *   history   no cutoff — transfers retrieved back to Jan 2023
 *   rate      200 requests/minute
 *
 * The 10-item cap is the constraint that shapes everything here: every
 * signal is computed from a bounded number of pages rather than a full
 * history sweep, and the fetch budget per vendor is kept to ~30 requests.
 */

export const NETWORKS = ["mainnet", "base", "arbitrum-one"] as const;
export type Network = (typeof NETWORKS)[number];

export type Transfer = {
  block_num: number;
  datetime: string;
  timestamp: number;
  transaction_id: string;
  contract: string;
  from: string;
  to: string;
  symbol: string;
  decimals: number;
  /** Human-scaled value as returned by the API */
  value: number;
  network: string;
};

export type Balance = {
  contract: string;
  symbol: string;
  decimals: number;
  value: number;
  network: string;
};

function clean(s: string | undefined) {
  return (s ?? "").replace(/[^\x20-\x7e]/g, "").trim();
}

function baseUrl() {
  return (
    clean(process.env.TOKEN_API_BASE_URL) || "https://api.pinax.network"
  ).replace(/\/+$/, "");
}

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T[]> {
  const jwt = clean(process.env.TOKEN_API_JWT);
  if (!jwt) throw new Error("TOKEN_API_JWT is not set");

  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Token API ${res.status} on ${path}: ${body.slice(0, 160)}`,
    );
  }

  const json = (await res.json()) as { data?: T[] };
  return json.data ?? [];
}

/** Free tier hard-caps at 10; asking for more returns 403. */
const PAGE = 10;

/**
 * Transfers in one direction, up to `maxPages`.
 *
 * Stops early on a short page — there is no total count in the response,
 * so a page below the limit is how we know we've reached the end.
 */
export async function fetchTransfers(opts: {
  network: Network;
  address: string;
  direction: "in" | "out";
  maxPages?: number;
  startTime?: number;
  endTime?: number;
}): Promise<Transfer[]> {
  const key = opts.direction === "in" ? "to_address" : "from_address";
  const out: Transfer[] = [];

  for (let page = 1; page <= (opts.maxPages ?? 5); page++) {
    const rows = await get<Transfer>("/v1/evm/transfers", {
      network: opts.network,
      [key]: opts.address,
      limit: PAGE,
      page,
      start_time: opts.startTime,
      end_time: opts.endTime,
    });
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchBalances(
  network: Network,
  address: string,
): Promise<Balance[]> {
  return get<Balance>("/v1/evm/balances", {
    network,
    address,
    limit: PAGE,
  });
}

/**
 * Approximate timestamp of the address's first activity, or null.
 *
 * The API returns newest-first with no ascending sort, so the earliest
 * transfer can't be read directly. We binary-search on *existence* —
 * "was there anything before T?" — and return the boundary.
 *
 * Searching on existence rather than on returned timestamps matters: a
 * limit=1 query answers with the most recent row before the cutoff, so
 * using that value made the result depend on where the loop happened to
 * stop. Two runs against the same address disagreed by nine months.
 *
 * 12 iterations over ~11 years converges to a few days, which is far
 * finer than the age bands need (30 / 90 / 365 days). Convergence is
 * fastest exactly where precision matters most — a brand new address.
 */
export async function findFirstActivity(
  network: Network,
  address: string,
  now = Date.now(),
): Promise<number | null> {
  const nowSec = Math.floor(now / 1000);
  const GENESIS = Math.floor(new Date("2015-07-30").getTime() / 1000);

  const probe = async (t: number): Promise<boolean> => {
    const [inbound, outbound] = await Promise.all([
      get<Transfer>("/v1/evm/transfers", {
        network,
        to_address: address,
        limit: 1,
        start_time: GENESIS,
        end_time: t,
      }),
      get<Transfer>("/v1/evm/transfers", {
        network,
        from_address: address,
        limit: 1,
        start_time: GENESIS,
        end_time: t,
      }),
    ]);
    return inbound.length + outbound.length > 0;
  };

  /**
   * Only negatives are retried.
   *
   * A throttled request can come back 200-with-empty, which is
   * indistinguishable from "no data" — and a false negative sends the
   * search permanently the wrong way. Running this search alongside the
   * bulk fetches produced answers nine months apart on the same address.
   * A false positive can't happen: data doesn't appear from nowhere.
   */
  const existsBefore = async (t: number): Promise<boolean> => {
    if (await probe(t)) return true;
    await new Promise((r) => setTimeout(r, 250));
    return probe(t);
  };

  if (!(await existsBefore(nowSec))) return null;

  let lo = GENESIS; // known: no activity at or before lo
  let hi = nowSec; // known: activity exists at or before hi

  for (let i = 0; i < 12 && hi - lo > 86_400 * 3; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (await existsBefore(mid)) hi = mid;
    else lo = mid;
  }

  return hi;
}

export type AccountType = "eoa" | "contract" | "delegated-eoa";

/**
 * Distinguish an EOA from a contract.
 *
 * EIP-7702 lets an EOA delegate to code, so a non-empty getCode no longer
 * means "contract". A delegation is exactly 23 bytes beginning 0xef0100 —
 * without that check Vitalik's address reports as a smart contract, which
 * would be a misleading signal on a vendor screen.
 */
export async function getAccountType(
  address: string,
): Promise<AccountType | null> {
  const rpc =
    clean(process.env.MAINNET_RPC_URL) || "https://ethereum-rpc.publicnode.com";
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address, "latest"],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json()) as { result?: string };
    const code = json.result;
    if (typeof code !== "string") return null;
    if (code === "0x") return "eoa";
    if (/^0xef0100[0-9a-fA-F]{40}$/.test(code)) return "delegated-eoa";
    return "contract";
  } catch {
    return null;
  }
}
