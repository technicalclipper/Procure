"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createBillAction,
  rematchBillAction,
  type BillActionState,
} from "./actions";

export function RaiseBill({
  slug,
  orderId,
  vendorName,
}: {
  slug: string;
  orderId: string;
  vendorName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BillActionState | null>(null);

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="text-[13px] font-medium text-indigo-900">
        Ready to bill
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-indigo-800">
        {vendorName} has invoiced and delivery is confirmed. Raising the bill
        runs the three-way match — order against receipt against invoice — and
        records the result. Nothing is paid unless all three agree.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createBillAction(slug, orderId);
            setResult(r);
            if (r.ok && r.id) router.push(`/o/${slug}/bills/${r.id}`);
          })
        }
        className="mt-3 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Matching…" : "Raise bill and match"}
      </button>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function RematchBill({
  slug,
  billId,
}: {
  slug: string;
  billId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BillActionState | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await rematchBillAction(slug, billId);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {pending ? "Re-running…" : "Run the match again"}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        Use once the cause is fixed — a corrected invoice, a vendor
        unblocked. Each run is kept; none replaces the last.
      </p>
      {result && (
        <div
          className={`mt-2 rounded-md border px-3 py-2 text-[12px] ${
            result.ok && result.matched
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message ?? result.error}
        </div>
      )}
    </div>
  );
}
