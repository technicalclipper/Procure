"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addVendorCommentAction,
  respondToOrderAction,
  type VendorActionState,
} from "./actions";

export function OrderResponse({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<VendorActionState | null>(null);

  const respond = (accept: boolean) =>
    start(async () => {
      const r = await respondToOrderAction(orderId, accept, reason);
      setResult(r);
      if (r.ok) {
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
      <div className="text-[13px] font-medium text-teal-900">
        Can you supply this?
      </div>
      <p className="mt-0.5 text-[12px] text-teal-800">
        Accepting confirms you&apos;ll deliver what&apos;s ordered. You can
        submit your invoice against it afterwards.
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Note — required if you reject"
        className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(true)}
          className="rounded-md bg-teal-700 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Accept order"}
        </button>
        <button
          type="button"
          disabled={pending || reason.trim().length === 0}
          title={reason.trim().length === 0 ? "Give a reason first" : undefined}
          onClick={() => respond(false)}
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

export function VendorCommentBox({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Ask a question or add a note — the buyer sees this"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />
      <button
        type="button"
        disabled={pending || body.trim().length === 0}
        onClick={() =>
          start(async () => {
            const r = await addVendorCommentAction(orderId, body);
            if (r.ok) {
              setBody("");
              setError(null);
              router.refresh();
            } else setError(r.error ?? "Failed");
          })
        }
        className="mt-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {pending ? "Posting…" : "Post comment"}
      </button>
      {error && <div className="mt-1 text-[11px] text-red-700">{error}</div>}
    </div>
  );
}
