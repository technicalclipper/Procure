"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitInvoiceAction, type VendorActionState } from "./actions";

/**
 * The vendor's own figure.
 *
 * Nothing is prefilled from the purchase order. Prefilling would make
 * the invoice agree with the order by construction and the three-way
 * match would be checking its own homework. What the form does instead
 * is show the consequence of the number they typed, before they send
 * it — a variance outside tolerance stops payment dead, and finding
 * that out a week later helps nobody.
 */
export function InvoiceForm({
  orderId,
  poNumber,
  orderedMinor,
  toleranceBps,
  orgName,
}: {
  orderId: string;
  poNumber: string;
  /// Serialised — BigInt can't cross the server/client boundary.
  orderedMinor: string;
  toleranceBps: number;
  orgName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<VendorActionState | null>(null);

  const ordered = Number(orderedMinor) / 1e6;
  const typed = Number(amount.replace(/[$,\s]/g, ""));
  const valid = amount.trim().length > 0 && Number.isFinite(typed) && typed > 0;

  const delta = valid ? typed - ordered : 0;
  const tolerance = (ordered * toleranceBps) / 10_000;
  const within = Math.abs(delta) <= tolerance + 1e-9;

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-[13px] font-medium text-emerald-900">
          Invoice submitted
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-emerald-800">
          {result.message}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
      <div className="text-[13px] font-medium text-teal-900">
        Invoice {orgName}
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-teal-800">
        Delivery is confirmed, so you can bill for {poNumber}. Enter your own
        invoice number and amount — they&apos;re checked against the order and
        the receipt, and payment releases automatically when all three agree.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">
            Your invoice number
          </span>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="INV-1042"
            className="mono mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">
            Amount (USDC)
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="tabular mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </label>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Note — explain any difference from the order (optional)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />

      {valid && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-[12px] ${
            within
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span>Ordered</span>
            <span className="tabular">{fmt(ordered)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span>You&apos;re invoicing</span>
            <span className="tabular">{fmt(typed)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-current/15 pt-1 font-medium">
            <span>Variance</span>
            <span className="tabular">
              {delta === 0 ? "" : delta > 0 ? "+" : "−"}
              {fmt(delta)}
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed">
            {within
              ? `Within the agreed ${(toleranceBps / 100).toFixed(2)}% tolerance — this will match and pay.`
              : `Outside the agreed ${(toleranceBps / 100).toFixed(2)}% tolerance. You can still send it, but ${orgName} has to resolve the difference before anything is paid. A note explaining why helps.`}
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={pending || !valid || number.trim().length === 0}
        onClick={() =>
          start(async () => {
            setResult(await submitInvoiceAction(orderId, number, amount, note));
            router.refresh();
          })
        }
        className="mt-3 rounded-md bg-teal-700 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-teal-800 disabled:opacity-40"
      >
        {pending ? "Submitting…" : "Submit invoice"}
      </button>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
