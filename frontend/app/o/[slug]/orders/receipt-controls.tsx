"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordReceiptAction } from "./receipt-actions";

export function ConfirmReceipt({
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
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="text-[13px] font-medium text-emerald-900">
        Has this arrived?
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-emerald-800">
        Confirming receipt is the second leg of the three-way match, and
        it&apos;s what lets {vendorName} invoice. Nothing can be paid until
        the order, this receipt and their invoice agree.
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Note — condition, partial delivery, anything worth recording (optional)"
        className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recordReceiptAction(slug, orderId, note);
            if (r.ok) {
              setNote("");
              setError(null);
              router.refresh();
            } else setError(r.error ?? "Failed");
          })
        }
        className="mt-2 rounded-md bg-emerald-700 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {pending ? "Recording…" : "Confirm goods received"}
      </button>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
