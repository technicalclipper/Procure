import { STABLECOINS, fetchStableTransfers, type Transfer } from "./graph";
import { NETWORKS } from "./graph";

/**
 * Counterparty graph for the 3D view.
 *
 * The vendor sits at the centre; every address it has traded stablecoins
 * with becomes a node, and edges carry direction, value and count. This
 * is the same indexed data the score is computed from, drawn rather than
 * tabulated — a conduit looks obviously different from a supplier when
 * you can see the shape of it.
 */

export type GraphNode = {
  id: string;
  label: string;
  kind: "vendor" | "payer" | "payee" | "both";
  /** Commercial-sized value received from / sent to the vendor */
  valueIn: number;
  valueOut: number;
  txCount: number;
  dustOnly: boolean;
};

export type GraphLink = {
  source: string;
  target: string;
  value: number;
  count: number;
  dust: boolean;
};

export type CounterpartyGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  truncated: boolean;
};

const DUST_USD = 10;
/** Keep the scene readable; the largest counterparties are what matter. */
const MAX_NODES = 40;

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function buildGraph(
  vendorAddress: string,
  inbound: Transfer[],
  outbound: Transfer[],
): CounterpartyGraph {
  const me = vendorAddress.toLowerCase();

  type Agg = {
    valueIn: number;
    valueOut: number;
    txCount: number;
    commercial: boolean;
  };
  const parties = new Map<string, Agg>();

  const touch = (addr: string) => {
    const k = addr.toLowerCase();
    if (!parties.has(k)) {
      parties.set(k, {
        valueIn: 0,
        valueOut: 0,
        txCount: 0,
        commercial: false,
      });
    }
    return parties.get(k)!;
  };

  for (const t of inbound) {
    if (t.from.toLowerCase() === me) continue;
    const p = touch(t.from);
    p.valueIn += t.value;
    p.txCount += 1;
    if (t.value >= DUST_USD) p.commercial = true;
  }
  for (const t of outbound) {
    if (t.to.toLowerCase() === me) continue;
    const p = touch(t.to);
    p.valueOut += t.value;
    p.txCount += 1;
    if (t.value >= DUST_USD) p.commercial = true;
  }

  // Commercial counterparties first, then by value — dust nodes are kept
  // but should never crowd out a real payer.
  const ranked = [...parties.entries()].sort((a, b) => {
    if (a[1].commercial !== b[1].commercial) return a[1].commercial ? -1 : 1;
    return (
      b[1].valueIn + b[1].valueOut - (a[1].valueIn + a[1].valueOut)
    );
  });

  const kept = ranked.slice(0, MAX_NODES);

  const nodes: GraphNode[] = [
    {
      id: me,
      label: short(vendorAddress),
      kind: "vendor",
      valueIn: kept.reduce((s, [, p]) => s + p.valueIn, 0),
      valueOut: kept.reduce((s, [, p]) => s + p.valueOut, 0),
      txCount: inbound.length + outbound.length,
      dustOnly: false,
    },
    ...kept.map(([addr, p]) => ({
      id: addr,
      label: short(addr),
      kind:
        p.valueIn > 0 && p.valueOut > 0
          ? ("both" as const)
          : p.valueIn > 0
            ? ("payer" as const)
            : ("payee" as const),
      valueIn: p.valueIn,
      valueOut: p.valueOut,
      txCount: p.txCount,
      dustOnly: !p.commercial,
    })),
  ];

  const links: GraphLink[] = [];
  for (const [addr, p] of kept) {
    if (p.valueIn > 0) {
      links.push({
        source: addr,
        target: me,
        value: p.valueIn,
        count: p.txCount,
        dust: !p.commercial,
      });
    }
    if (p.valueOut > 0) {
      links.push({
        source: me,
        target: addr,
        value: p.valueOut,
        count: p.txCount,
        dust: !p.commercial,
      });
    }
  }

  return { nodes, links, truncated: ranked.length > MAX_NODES };
}

/** Fetch and build in one go, for the screening action. */
export async function fetchCounterpartyGraph(
  address: string,
): Promise<CounterpartyGraph> {
  const perNetwork = await Promise.all(
    NETWORKS.filter((n) => (STABLECOINS[n] ?? []).length > 0).map(
      async (network) => {
        const [inbound, outbound] = await Promise.all([
          fetchStableTransfers({
            network,
            address,
            direction: "in",
            maxPages: 2,
          }).catch(() => [] as Transfer[]),
          fetchStableTransfers({
            network,
            address,
            direction: "out",
            maxPages: 2,
          }).catch(() => [] as Transfer[]),
        ]);
        return { inbound, outbound };
      },
    ),
  );

  return buildGraph(
    address,
    perNetwork.flatMap((n) => n.inbound),
    perNetwork.flatMap((n) => n.outbound),
  );
}
