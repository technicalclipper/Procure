"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CounterpartyGraph, GraphNode } from "@/lib/risk/network";

// three.js touches window on import, so it can never run during SSR.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center text-[12px] text-slate-400">
      Loading graph…
    </div>
  ),
});

const COLORS = {
  vendor: "#4f46e5",
  payer: "#059669",
  payee: "#0284c7",
  both: "#7c3aed",
  dust: "#cbd5e1",
} as const;

function colorFor(n: GraphNode) {
  if (n.kind === "vendor") return COLORS.vendor;
  if (n.dustOnly) return COLORS.dust;
  return COLORS[n.kind];
}

export function CounterpartyGraphView({
  graph,
  address,
}: {
  graph: CounterpartyGraph;
  address: string;
}) {
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const dustCount = graph.nodes.filter((n) => n.dustOnly).length;
  const commercial = graph.nodes.filter(
    (n) => n.kind !== "vendor" && !n.dustOnly,
  ).length;

  /*
   * Show dust by default when there is barely any real trade.
   *
   * Hiding it is right for an established vendor, where dust is noise
   * around a real business. But when an address has 3 commercial
   * counterparties and 26 dust ones, the dust IS the finding — hiding it
   * renders a nearly empty graph and buries the reason for the score.
   */
  const [showDust, setShowDust] = useState(commercial < 3 && dustCount > 0);
  const wrapRef = useRef<HTMLDivElement>(null);

  /*
   * Measure the container and pass the width explicitly.
   *
   * Without it the library falls back to window.innerWidth, so the canvas
   * is wider than its box and the force simulation centres itself
   * off-screen — the graph appears jammed against the right edge.
   */
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const nodes = graph.nodes.filter((n) => showDust || !n.dustOnly);
    const ids = new Set(nodes.map((n) => n.id));
    const links = graph.links.filter(
      (l) =>
        ids.has(l.source) &&
        ids.has(l.target) &&
        (showDust || !l.dust),
    );
    // The library mutates what you hand it, so give it copies.
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    };
  }, [graph, showDust]);

  if (graph.nodes.length <= 1) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-[12px] text-slate-500">
        No counterparties to plot — this address has no stablecoin transfers
        on the chains checked.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <div>
          <div className="text-[12px] font-medium text-slate-900">
            Counterparty graph
          </div>
          <div className="text-[11px] text-slate-500">
            {commercial} commercial counterpart
            {commercial === 1 ? "y" : "ies"}
            {dustCount > 0 && ` · ${dustCount} dust-only`}
            {graph.truncated && " · showing the largest 40"}
            {dustCount > 0 && commercial < 3 && (
              <span className="ml-1 text-amber-700">
                — mostly dust, which is why the score is low
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Legend />
          {dustCount > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={showDust}
                onChange={(e) => setShowDust(e.target.checked)}
                className="h-3 w-3"
              />
              Show dust ({dustCount})
            </label>
          )}
        </div>
      </div>

      <div ref={wrapRef} className="relative h-[380px] overflow-hidden bg-slate-50">
        {width > 0 && (
        <ForceGraph3D
          graphData={data}
          backgroundColor="#f8fafc"
          width={width}
          height={380}
          nodeLabel={(n) => {
            const node = n as unknown as GraphNode;
            return `${node.label}\n${node.txCount} transfer${node.txCount === 1 ? "" : "s"}\nin $${node.valueIn.toFixed(2)} · out $${node.valueOut.toFixed(2)}`;
          }}
          nodeColor={(n) => colorFor(n as unknown as GraphNode)}
          nodeRelSize={5}
          nodeVal={(n) => {
            const node = n as unknown as GraphNode;
            if (node.kind === "vendor") return 14;
            return Math.max(1, Math.log10(1 + node.valueIn + node.valueOut) * 2);
          }}
          linkColor={(l) =>
            (l as unknown as { dust: boolean }).dust ? "#e2e8f0" : "#94a3b8"
          }
          linkWidth={(l) =>
            Math.max(
              0.4,
              Math.log10(1 + (l as unknown as { value: number }).value) * 0.7,
            )
          }
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={(l) =>
            (l as unknown as { dust: boolean }).dust ? 0 : 2
          }
          linkDirectionalParticleSpeed={0.006}
          onNodeHover={(n) => setHovered((n as unknown as GraphNode) ?? null)}
          enableNodeDrag={false}
          showNavInfo={false}
        />
        )}

        {hovered && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
            <div className="mono text-[11px] text-slate-900">
              {hovered.id === address.toLowerCase()
                ? `${hovered.label} — this vendor`
                : hovered.label}
            </div>
            <div className="tabular mt-0.5 text-[11px] text-slate-600">
              {hovered.txCount} transfer{hovered.txCount === 1 ? "" : "s"} · in $
              {hovered.valueIn.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              · out $
              {hovered.valueOut.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
            {hovered.dustOnly && (
              <div className="mt-0.5 text-[10px] text-amber-700">
                Dust only — excluded from scoring
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
        Built from the same indexed stablecoin transfers the score is
        computed from. Drag to rotate, scroll to zoom.
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    ["Vendor", COLORS.vendor],
    ["Pays them", COLORS.payer],
    ["They pay", COLORS.payee],
    ["Both", COLORS.both],
  ] as const;
  return (
    <div className="flex items-center gap-2.5">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1 text-[10px] text-slate-500">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
