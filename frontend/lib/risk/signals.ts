import {
  NETWORKS,
  STABLECOINS,
  fetchBalances,
  fetchStableTransfers,
  findFirstActivity,
  getAccountType,
  type Balance,
  type Network,
  type Transfer,
} from "./graph";

/**
 * Behavioural risk signals for a payout address.
 *
 * This answers "does this address behave like a legitimate operating
 * business?" — not "is this address who they claim to be." Onchain
 * history is a heuristic; it cannot prove identity. The score is advisory
 * to a human reviewer and is never an auto-approve.
 */

export type SignalTone = "good" | "neutral" | "warn" | "bad";

export type EvidenceRow = {
  direction: "in" | "out";
  datetime: string;
  block: number;
  symbol: string;
  value: number;
  counterparty: string;
  network: string;
};

export type Signal = {
  key: string;
  label: string;
  /** One line a procurement person can act on */
  finding: string;
  /** Contribution to the score; negative is a penalty */
  delta: number;
  tone: SignalTone;
  evidence: EvidenceRow[];
};

export type ScreeningResult = {
  address: string;
  score: number;
  band: "BLOCKED" | "REVIEW" | "CLEAR";
  signals: Signal[];
  stats: {
    firstActivity: string | null;
    ageDays: number | null;
    inboundCount: number;
    outboundCount: number;
    dustCount: number;
    networksWithActivity: string[];
    accountType: string | null;
    distinctPayers: number;
    sweepRatio: number | null;
    balanceCount: number;
  };
  fetchedAt: string;
};

const DAY = 86_400;

/**
 * Stablecoin transfers below this are not commercial activity.
 *
 * Address-poisoning attacks spray tiny real-USDC transfers so that
 * lookalike addresses appear in someone's history. It is genuine
 * stablecoin, so filtering by token alone doesn't remove it — an unused
 * vanity address scored 100 on 33 inbound transfers worth about a dollar
 * each. A vendor invoice is hundreds or thousands.
 */
const DUST_USD = 10;

/** How close in blocks an outflow must be to count as forwarding. */
const SWEEP_BLOCK_WINDOW = 25;
/** How much of the inflow must leave to count as swept. */
const SWEEP_VALUE_RATIO = 0.9;

function evidence(t: Transfer, direction: "in" | "out"): EvidenceRow {
  return {
    direction,
    datetime: t.datetime,
    block: t.block_num,
    symbol: t.symbol,
    value: t.value,
    counterparty: direction === "in" ? t.from : t.to,
    network: t.network,
  };
}

/**
 * Fraction of inbound transfers forwarded on almost immediately.
 *
 * Matched per token contract rather than by raw value, because values
 * across different tokens aren't comparable — 500 USDC and 500 SHIB are
 * not the same movement.
 */
function detectSweeps(inbound: Transfer[], outbound: Transfer[]) {
  const swept: { inflow: Transfer; outflow: Transfer }[] = [];

  for (const i of inbound) {
    const match = outbound.find(
      (o) =>
        o.contract.toLowerCase() === i.contract.toLowerCase() &&
        o.block_num >= i.block_num &&
        o.block_num - i.block_num <= SWEEP_BLOCK_WINDOW &&
        i.value > 0 &&
        o.value >= i.value * SWEEP_VALUE_RATIO,
    );
    if (match) swept.push({ inflow: i, outflow: match });
  }

  return {
    ratio: inbound.length > 0 ? swept.length / inbound.length : null,
    pairs: swept,
  };
}

export async function screenAddress(
  address: string,
  now = Date.now(),
): Promise<ScreeningResult> {
  // Bulk fetches first, then the binary search — running them together
  // throttles the search into false negatives. See graph.ts.
  const perNetwork = await Promise.all(
    NETWORKS.map(async (network) => {
      const [inbound, outbound, balances] = await Promise.all([
        fetchStableTransfers({ network, address, direction: "in", maxPages: 2 }),
        fetchStableTransfers({ network, address, direction: "out", maxPages: 2 }),
        fetchBalances(network, address).catch(() => [] as Balance[]),
      ]);
      return { network, inbound, outbound, balances };
    }),
  );

  const accountType = await getAccountType(address);

  /*
   * Age only needs precision when the address looks new.
   *
   * Transfers come back newest-first, so the oldest row we sampled is a
   * lower bound on the address's age. If that is already over a year old
   * the band is settled and the binary search would tell us nothing the
   * score uses — and the search is by far the most expensive call here.
   *
   * Running it on every network for every vendor cost ~100 requests and
   * 34 seconds, which tripped the 200/minute limit. This pays the cost
   * only for addresses that might actually be young, which is exactly
   * the case where the answer matters.
   */
  const sampled = perNetwork.flatMap((n) => [...n.inbound, ...n.outbound]);
  const oldestSampled = sampled.length
    ? Math.min(...sampled.map((t) => t.timestamp))
    : null;
  const nowSec = Math.floor(now / 1000);

  let firstActivity: number | null = null;
  let ageIsLowerBound = false;

  if (oldestSampled !== null && nowSec - oldestSampled > 365 * DAY) {
    firstActivity = oldestSampled;
    ageIsLowerBound = true;
  } else {
    // Search the busiest network only; the earliest date across chains is
    // almost always on the one with the most history.
    const busiest = [...perNetwork]
      .filter((n) => n.inbound.length + n.outbound.length > 0)
      .sort(
        (a, b) =>
          b.inbound.length + b.outbound.length -
          (a.inbound.length + a.outbound.length),
      )[0];

    if (busiest) {
      firstActivity = await findFirstActivity(
        busiest.network as Network,
        address,
        now,
      );
      if (firstActivity !== null && oldestSampled !== null) {
        firstActivity = Math.min(firstActivity, oldestSampled);
      }
    }
  }

  const allInbound = perNetwork.flatMap((n) => n.inbound);
  const allOutbound = perNetwork.flatMap((n) => n.outbound);

  // Everything below is computed on commercial-sized movements only.
  const inbound = allInbound.filter((t) => t.value >= DUST_USD);
  const outbound = allOutbound.filter((t) => t.value >= DUST_USD);
  const dustIn = allInbound.filter((t) => t.value < DUST_USD);
  const balances = perNetwork.flatMap((n) => n.balances);
  const networksWithActivity = perNetwork
    .filter((n) =>
      [...n.inbound, ...n.outbound].some((t) => t.value >= DUST_USD),
    )
    .map((n) => n.network);

  const sweeps = detectSweeps(inbound, outbound);
  const distinctPayers = new Set(inbound.map((t) => t.from.toLowerCase())).size;
  const ageDays =
    firstActivity !== null
      ? Math.floor((now / 1000 - firstActivity) / DAY)
      : null;

  const signals: Signal[] = [];

  /* ── age ──────────────────────────────────────────────────────────── */
  if (ageDays === null) {
    signals.push({
      key: "age",
      label: "Address age",
      finding:
        "No transfer history found on any supported chain. Either brand new, or it operates somewhere we don't index.",
      delta: -25,
      tone: "bad",
      evidence: [],
    });
  } else if (ageDays < 30) {
    signals.push({
      key: "age",
      label: "Address age",
      finding: `First activity ${ageDays} day${ageDays === 1 ? "" : "s"} ago. A wallet this new invoicing for real work is the clearest red flag there is.`,
      delta: -35,
      tone: "bad",
      evidence: [],
    });
  } else if (ageDays < 90) {
    signals.push({
      key: "age",
      label: "Address age",
      finding: `First activity ${ageDays} days ago — under three months.`,
      delta: -18,
      tone: "warn",
      evidence: [],
    });
  } else if (ageDays < 365) {
    signals.push({
      key: "age",
      label: "Address age",
      finding: `First activity ${Math.floor(ageDays / 30)} months ago.`,
      delta: -6,
      tone: "neutral",
      evidence: [],
    });
  } else {
    signals.push({
      key: "age",
      label: "Address age",
      finding: ageIsLowerBound
        ? `Active for at least ${(ageDays / 365).toFixed(1)} years.`
        : `Active for ${(ageDays / 365).toFixed(1)} years.`,
      delta: 0,
      tone: "good",
      evidence: [],
    });
  }

  /* ── forwarding / sweep ───────────────────────────────────────────── */
  if (sweeps.ratio === null) {
    signals.push({
      key: "sweep",
      label: "Forwarding behaviour",
      finding: "No inbound transfers to analyse.",
      delta: 0,
      tone: "neutral",
      evidence: [],
    });
  } else {
    const pct = Math.round(sweeps.ratio * 100);
    const ev = sweeps.pairs
      .slice(0, 4)
      .flatMap((p) => [evidence(p.inflow, "in"), evidence(p.outflow, "out")]);

    if (sweeps.ratio >= 0.9) {
      signals.push({
        key: "sweep",
        label: "Forwarding behaviour",
        finding: `${pct}% of inbound transfers are forwarded on within ${SWEEP_BLOCK_WINDOW} blocks. That is a pass-through account, not a supplier receiving payment.`,
        delta: -32,
        tone: "bad",
        evidence: ev,
      });
    } else if (sweeps.ratio >= 0.6) {
      signals.push({
        key: "sweep",
        label: "Forwarding behaviour",
        finding: `${pct}% of inbound transfers leave again almost immediately.`,
        delta: -16,
        tone: "warn",
        evidence: ev,
      });
    } else {
      signals.push({
        key: "sweep",
        label: "Forwarding behaviour",
        finding:
          pct === 0
            ? "Funds received are retained rather than forwarded on."
            : `${pct}% of inbound transfers are forwarded quickly — within normal range.`,
        delta: 0,
        tone: "good",
        evidence: ev,
      });
    }
  }

  /* ── counterparty diversity ───────────────────────────────────────── */
  if (inbound.length === 0) {
    signals.push({
      key: "payers",
      label: "Counterparty diversity",
      finding: "No inbound stablecoin payments observed.",
      delta: -10,
      tone: "warn",
      evidence: [],
    });
  } else if (distinctPayers === 1) {
    signals.push({
      key: "payers",
      label: "Counterparty diversity",
      finding:
        "Every inbound payment comes from a single address. Consistent with a conduit rather than a business with customers.",
      delta: -14,
      tone: "warn",
      evidence: inbound.slice(0, 4).map((t) => evidence(t, "in")),
    });
  } else {
    signals.push({
      key: "payers",
      label: "Counterparty diversity",
      finding: `Receives from ${distinctPayers} distinct addresses.`,
      delta: distinctPayers >= 5 ? 4 : 0,
      tone: "good",
      evidence: inbound.slice(0, 4).map((t) => evidence(t, "in")),
    });
  }

  /* ── activity level ───────────────────────────────────────────────── */
  const total = inbound.length + outbound.length;
  if (total === 0) {
    signals.push({
      key: "activity",
      label: "Activity level",
      finding: "No stablecoin transfers found. Nothing suggests this address is used for commercial payments.",
      delta: -12,
      tone: "bad",
      evidence: [],
    });
  } else {
    signals.push({
      key: "activity",
      label: "Activity level",
      finding: `${inbound.length} inbound and ${outbound.length} outbound stablecoin transfers sampled across ${networksWithActivity.length} chain${networksWithActivity.length === 1 ? "" : "s"}.`,
      delta: 0,
      tone: "neutral",
      evidence: [],
    });
  }

  /* ── account type ─────────────────────────────────────────────────── */
  signals.push({
    key: "accountType",
    label: "Account type",
    finding:
      accountType === "contract"
        ? "Smart contract — often a Safe or other managed treasury."
        : accountType === "delegated-eoa"
          ? "Externally owned account with an EIP-7702 delegation."
          : accountType === "eoa"
            ? "Externally owned account — a plain wallet."
            : "Could not determine account type.",
    delta: accountType === "contract" ? 4 : 0,
    tone: accountType === "contract" ? "good" : "neutral",
    evidence: [],
  });

  /* ── dust / address poisoning ─────────────────────────────────────── */
  if (dustIn.length >= 5 && inbound.length === 0) {
    signals.push({
      key: "dust",
      label: "Dust activity",
      finding: `${dustIn.length} inbound stablecoin transfers, all under $${DUST_USD}, and nothing above. That is address-poisoning noise rather than trade — this address has received no commercial payment.`,
      delta: -18,
      tone: "bad",
      evidence: dustIn.slice(0, 4).map((t) => evidence(t, "in")),
    });
  } else if (dustIn.length >= 5) {
    signals.push({
      key: "dust",
      label: "Dust activity",
      finding: `${dustIn.length} sub-$${DUST_USD} transfers excluded as dust; the figures above count commercial-sized movements only.`,
      delta: 0,
      tone: "neutral",
      evidence: dustIn.slice(0, 3).map((t) => evidence(t, "in")),
    });
  }

  /* ── holdings ─────────────────────────────────────────────────────── */
  // Stablecoins only. Counting every token would reward airdrop spam,
  // which any address accumulates without doing anything.
  const stableSet = new Set(
    Object.values(STABLECOINS).flat().map((c) => c.toLowerCase()),
  );
  const stableBalances = balances.filter((b) =>
    stableSet.has(b.contract.toLowerCase()),
  );
  const stableHeld = stableBalances.reduce((s, b) => s + (b.value ?? 0), 0);

  signals.push({
    key: "balances",
    label: "Stablecoin holdings",
    finding:
      stableBalances.length === 0
        ? "Holds no stablecoin balance on the chains checked."
        : `Holds ${stableHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })} across ${[...new Set(stableBalances.map((b) => b.symbol))].join(", ")}.`,
    delta: stableBalances.length === 0 ? -6 : 0,
    tone: stableBalances.length === 0 ? "warn" : "neutral",
    evidence: [],
  });

  const score = Math.max(
    0,
    Math.min(100, 100 + signals.reduce((s, x) => s + x.delta, 0)),
  );

  const blockBelow = Number(process.env.VENDOR_RISK_BLOCK_BELOW ?? 40);
  const reviewBelow = Number(process.env.VENDOR_RISK_REVIEW_BELOW ?? 70);
  const band =
    score < blockBelow ? "BLOCKED" : score < reviewBelow ? "REVIEW" : "CLEAR";

  return {
    address,
    score,
    band,
    signals,
    stats: {
      firstActivity: firstActivity
        ? new Date(firstActivity * 1000).toISOString()
        : null,
      ageDays,
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      dustCount: dustIn.length,
      networksWithActivity,
      accountType,
      distinctPayers,
      sweepRatio: sweeps.ratio,
      balanceCount: stableBalances.length,
    },
    fetchedAt: new Date(now).toISOString(),
  };
}
