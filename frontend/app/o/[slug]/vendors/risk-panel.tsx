"use client";

import { useState, useTransition } from "react";
import type { Signal, SignalTone } from "@/lib/risk/signals";
import { CounterpartyGraphView } from "./counterparty-graph";
import {
  screenVendorAction,
  approveVendorAction,
  type ScreenPayload,
} from "./screen-actions";

const BAND: Record<
  string,
  { label: string; tone: string; dot: string; consequence: string }
> = {
  CLEAR: {
    label: "Clear",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-500",
    consequence: "Eligible for the payment allowlist.",
  },
  REVIEW: {
    label: "Review",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-500",
    consequence: "Activate only if you are satisfied with the evidence below.",
  },
  BLOCKED: {
    label: "Blocked",
    tone: "border-red-200 bg-red-50 text-red-900",
    dot: "bg-red-500",
    consequence:
      "This address will not be added to the payment allowlist without a written override.",
  },
};

const TONE_TEXT: Record<SignalTone, string> = {
  good: "text-emerald-700",
  neutral: "text-slate-500",
  warn: "text-amber-700",
  bad: "text-red-700",
};

const STEPS = [
  "Resolving address across 3 chains",
  "Fetching stablecoin transfers",
  "Reading balances",
  "Determining account type",
  "Finding first activity",
  "Computing signals",
  "Writing assessment",
];

export function RiskPanel({
  slug,
  vendorId,
  vendorName,
  address,
  initial,
  status,
}: {
  slug: string;
  vendorId: string;
  vendorName: string;
  address: string;
  initial: ScreenPayload | null;
  status: string;
}) {
  const [payload, setPayload] = useState<ScreenPayload | null>(initial);
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setStep(0);
    // Advance the checklist while the request is in flight. The work is
    // one server round trip; this shows what it is doing rather than
    // spinning silently for ten seconds.
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      1400,
    );
    start(async () => {
      const r = await screenVendorAction(slug, vendorId);
      clearInterval(timer);
      if (r.ok) setPayload(r.payload);
      else setError(r.error);
    });
  }

  if (pending) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-[13px] font-medium text-slate-900">
          Screening {vendorName}
        </div>
        <ul className="mt-3 space-y-1.5">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 text-[12px] ${
                i < step
                  ? "text-slate-600"
                  : i === step
                    ? "text-slate-900"
                    : "text-slate-300"
              }`}
            >
              <span className="w-3">
                {i < step ? "✓" : i === step ? "⋯" : "○"}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="text-[13px] font-medium text-slate-900">
          Not screened yet
        </div>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
          Screening reads this address&apos;s stablecoin history from The
          Graph across Ethereum, Base and Arbitrum, scores how it behaves,
          and decides whether it may join the payment allowlist.
        </p>
        <button
          onClick={run}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
        >
          Run risk check
        </button>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-[12px] text-red-900">
            {error}
          </div>
        )}
      </div>
    );
  }

  const band = BAND[payload.band] ?? BAND.REVIEW;
  const penalties = payload.signals.filter((s) => s.delta < 0);
  const credits = payload.signals.filter((s) => s.delta > 0);
  const totalPenalty = penalties.reduce((s, x) => s + x.delta, 0);
  const totalCredit = credits.reduce((s, x) => s + x.delta, 0);

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <div className={`rounded-lg border p-5 ${band.tone}`}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${band.dot}`} />
              <span className="text-[13px] font-semibold uppercase tracking-wide">
                {band.label}
              </span>
            </div>
            <p className="mt-1.5 max-w-lg text-[13px]">{band.consequence}</p>
            <div className="mono mt-2 text-[11px] opacity-70">{address}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tabular text-[34px] font-semibold leading-none">
              {payload.score}
            </div>
            <div className="text-[11px] opacity-70">out of 100</div>
          </div>
        </div>
      </div>

      {/* Score composition */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-[12px] font-medium text-slate-900">
            How the score was reached
          </div>
          <div className="tabular text-[11px] text-slate-500">
            100 {totalCredit > 0 && `+ ${totalCredit}`} {totalPenalty} ={" "}
            <span className="font-semibold text-slate-900">
              {payload.score}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {payload.signals.map((s) => (
            <WeightRow key={s.key} signal={s} />
          ))}
        </div>
      </div>

      {/* Assessment */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <div className="text-[12px] font-medium text-slate-900">
            Assessment
          </div>
          <div className="text-[10px] text-slate-400">
            {payload.narrativeModel
              ? `written by ${payload.narrativeModel} from the signals above`
              : "rule-based summary"}
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-700">
          {payload.narrative}
        </p>
        {payload.narrativeError && (
          <div className="mt-2 text-[11px] text-amber-700">
            {payload.narrativeError}
          </div>
        )}
      </div>

      {/* Graph */}
      <CounterpartyGraphView graph={payload.graph} address={address} />

      {/* Decision */}
      <DecisionBar
        slug={slug}
        vendorId={vendorId}
        band={payload.band}
        status={status}
        onRescreen={run}
      />

      <div className="text-[11px] text-slate-400">
        Screened {new Date(payload.fetchedAt).toLocaleString("en-GB")} · signals
        computed from indexed stablecoin transfers; the assessment interprets
        them and does not decide.
      </div>
    </div>
  );
}

function WeightRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const hasEvidence = signal.evidence.length > 0;
  const magnitude = Math.min(100, Math.abs(signal.delta) * 2.5);

  return (
    <div className="rounded-md border border-slate-100">
      <button
        type="button"
        onClick={() => hasEvidence && setOpen((v) => !v)}
        className={`flex w-full items-start gap-3 px-3 py-2 text-left ${
          hasEvidence ? "hover:bg-slate-50" : "cursor-default"
        }`}
      >
        <span className="w-3 pt-0.5 text-[10px] text-slate-400">
          {hasEvidence ? (open ? "▼" : "▶") : ""}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-slate-900">
              {signal.label}
            </span>
            <span
              className={`tabular shrink-0 text-[12px] font-semibold ${
                signal.delta < 0
                  ? "text-red-700"
                  : signal.delta > 0
                    ? "text-emerald-700"
                    : "text-slate-400"
              }`}
            >
              {signal.delta > 0 ? `+${signal.delta}` : signal.delta || "0"}
            </span>
          </span>

          <span
            className={`mt-0.5 block text-[11px] leading-snug ${TONE_TEXT[signal.tone]}`}
          >
            {signal.finding}
          </span>

          {signal.delta !== 0 && (
            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${
                  signal.delta < 0 ? "bg-red-400" : "bg-emerald-400"
                }`}
                style={{ width: `${magnitude}%` }}
              />
            </span>
          )}
        </span>
      </button>

      {open && hasEvidence && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Evidence
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {signal.evidence.map((e, i) => (
                <tr key={i} className="text-slate-600">
                  <td className="py-0.5 pr-2">
                    <span
                      className={
                        e.direction === "in"
                          ? "text-emerald-700"
                          : "text-sky-700"
                      }
                    >
                      {e.direction === "in" ? "in" : "out"}
                    </span>
                  </td>
                  <td className="mono py-0.5 pr-2">
                    {e.counterparty.slice(0, 10)}…
                  </td>
                  <td className="tabular py-0.5 pr-2 text-right">
                    {e.value.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {e.symbol}
                  </td>
                  <td className="py-0.5 pr-2 text-slate-400">{e.datetime}</td>
                  <td className="mono py-0.5 text-slate-400">
                    #{e.block.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DecisionBar({
  slug,
  vendorId,
  band,
  status,
  onRescreen,
}: {
  slug: string;
  vendorId: string;
  band: string;
  status: string;
  onRescreen: () => void;
}) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsOverride = band === "BLOCKED";
  const alreadyActive = status === "ACTIVE";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {needsOverride && !alreadyActive && (
        <div className="mb-3">
          <label className="block text-[11px] font-medium text-slate-600">
            Override justification
            <span className="ml-1 font-normal text-slate-400">
              recorded against the vendor
            </span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this address safe to pay despite the screen?"
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || alreadyActive}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("id", vendorId);
              fd.set("reason", reason);
              const r = await approveVendorAction(slug, fd);
              if (r.ok) {
                setMsg(r.message ?? "Activated.");
                setError(null);
              } else {
                setError(r.error ?? "Failed");
                setMsg(null);
              }
            })
          }
          className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {alreadyActive
            ? "Already on allowlist"
            : needsOverride
              ? "Override & activate"
              : "Add to payment allowlist"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={onRescreen}
          className="rounded-md border border-slate-300 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Re-screen
        </button>
      </div>

      {msg && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {msg}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
