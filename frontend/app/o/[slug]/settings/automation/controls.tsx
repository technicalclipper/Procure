"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  retrySyncAction,
  setAutoSettleAction,
  type AutomationState,
} from "./actions";

export function AutoSettleToggle({
  slug,
  enabled,
  thresholdOnChain,
}: {
  slug: string;
  enabled: boolean;
  thresholdOnChain: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [result, setResult] = useState<AutomationState | null>(null);

  const toggle = () =>
    start(async () => {
      const next = !on;
      const r = await setAutoSettleAction(slug, next);
      setResult(r);
      if (r.ok) {
        setOn(next);
        router.refresh();
      }
    });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="text-[14px] font-medium text-slate-900">
            Settle on match
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            When a bill passes the three-way match and Arc already holds
            enough approver signatures, pay the vendor immediately instead
            of waiting for someone to press a button.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
        <span className="font-medium text-slate-900">
          This grants no new power.
        </span>{" "}
        The contract still verifies every signature, the vendor allowlist
        and the budget, and still reverts if any of it fails. What it
        removes is the last human step that wasn&apos;t deciding anything
        — if the match passing and the signatures clearing really are the
        authorisation, a person pressing Pay afterwards is a fourth
        approval nobody designed.
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span
          className={`rounded px-1.5 py-0.5 ${
            thresholdOnChain > 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          Arc requires {thresholdOnChain} signature
          {thresholdOnChain === 1 ? "" : "s"} at level 1
        </span>
        {thresholdOnChain === 0 && (
          <span className="text-slate-500">
            — configure an approval level first, or nothing can settle
          </span>
        )}
      </div>

      {result?.ok && result.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {result.message}
        </div>
      )}
      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function RetrySync({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AutomationState | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-[14px] font-medium text-slate-900">
        Re-push anything Arc missed
      </div>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-600">
        Writes to the chain are best-effort, so a bad RPC day never stops
        anyone editing their own settings. The cost of that choice is
        drift. This walks every approval level, vendor and purchase order
        and pushes whatever the contract doesn&apos;t already hold.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await retrySyncAction(slug));
            router.refresh();
          })
        }
        className="mt-3 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Pushing to Arc…" : "Check and re-push"}
      </button>

      {result?.message && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
          {result.message}
        </div>
      )}
      {result && !result.ok && result.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
