"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelOrderAction,
  issueOrderAction,
  type OrderActionState,
} from "./actions";

export function IssueOrderButton({
  slug,
  requestId,
}: {
  slug: string;
  requestId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<OrderActionState | null>(null);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="text-[13px] font-medium text-emerald-900">
        Approved — ready to order
      </div>
      <p className="mt-0.5 text-[12px] text-emerald-800">
        Issuing commits the budget and sends the purchase order to the
        vendor. Budget is re-checked at this point, not at approval.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await issueOrderAction(slug, requestId);
            setResult(r);
            if (r.ok && r.id) router.push(`/o/${slug}/orders/${r.id}`);
          })
        }
        className="mt-3 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Issuing…" : "Issue purchase order"}
      </button>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function CancelOrder({
  slug,
  orderId,
}: {
  slug: string;
  orderId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-red-700 hover:underline"
      >
        Cancel order
      </button>
    );
  }

  return (
    <div className="max-w-md">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why is this being cancelled?"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px]"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length === 0}
          onClick={() =>
            start(async () => {
              const r = await cancelOrderAction(slug, orderId, reason);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setError(r.error ?? "Failed");
            })
          }
          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          {pending ? "Cancelling…" : "Confirm cancel"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 py-1 text-[12px] text-slate-600 hover:text-slate-900"
        >
          Keep it
        </button>
      </div>
      {error && <div className="mt-1 text-[11px] text-red-700">{error}</div>}
    </div>
  );
}
