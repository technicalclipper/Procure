"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideAction, type DecisionState } from "./approve-actions";

export function DecisionPanel({
  slug,
  requestId,
  levelLabel,
  remaining,
}: {
  slug: string;
  requestId: string;
  levelLabel: string;
  remaining: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<DecisionState | null>(null);

  const decide = (approved: boolean) =>
    start(async () => {
      const r = await decideAction(slug, requestId, approved, comment);
      setResult(r);
      if (r.ok) {
        setComment("");
        router.refresh();
      }
    });

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="text-[13px] font-medium text-indigo-900">
        This is waiting on you
      </div>
      <p className="mt-0.5 text-[12px] text-indigo-800">
        {levelLabel}
        {remaining > 1 &&
          ` · ${remaining} more signature${remaining === 2 ? "" : "s"} needed after yours`}
      </p>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Comment — required if you reject"
        className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending || comment.trim().length === 0}
          title={
            comment.trim().length === 0
              ? "Give a reason before rejecting"
              : undefined
          }
          onClick={() => decide(false)}
          className="rounded-md border border-red-300 bg-white px-3 py-2 text-[13px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Reject
        </button>
      </div>

      {result?.ok && result.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {result.message}
        </div>
      )}
      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
