"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payBillAction, type PayState } from "./pay-actions";

/**
 * The button that moves money.
 *
 * It doesn't decide anything. The match decided, the approvers signed,
 * and Arc enforces both — so the honest presentation is "submit this to
 * the chain and see what it says", not "authorise this payment".
 */
export function PayBill({
  slug,
  billId,
  amount,
  vendorName,
  signaturesOnFile,
  signaturesRequired,
  explorerBase,
}: {
  slug: string;
  billId: string;
  amount: string;
  vendorName: string;
  signaturesOnFile: number;
  signaturesRequired: number;
  explorerBase: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PayState | null>(null);

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-[13px] font-medium text-emerald-900">Paid</div>
        <p className="mt-1 text-[12px] text-emerald-800">{result.message}</p>
        {result.txHash && (
          <a
            href={`${explorerBase}/tx/${result.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mono mt-2 inline-block text-[12px] text-emerald-700 underline underline-offset-2"
          >
            {result.txHash.slice(0, 18)}… ↗
          </a>
        )}
      </div>
    );
  }

  const short = signaturesOnFile < signaturesRequired;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="text-[13px] font-medium text-indigo-900">
        Release payment
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-indigo-800">
        {amount} to {vendorName}, settled in USDC on Arc. The contract
        re-checks the approver signatures, the allowlist and the budget
        before it moves anything — pressing this submits the evidence, it
        doesn&apos;t authorise the payment.
      </p>

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span
          className={`rounded px-1.5 py-0.5 ${
            short
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {signaturesOnFile}/{signaturesRequired} signature
          {signaturesRequired === 1 ? "" : "s"} on chain
        </span>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await payBillAction(slug, billId));
            router.refresh();
          })
        }
        className="mt-3 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Submitting to Arc…" : `Pay ${amount} on Arc`}
      </button>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          <div className="font-medium">
            {result.reverted ? "Arc rejected it" : "Not submitted"}
          </div>
          <div className="mt-0.5 leading-relaxed">{result.error}</div>
        </div>
      )}
    </div>
  );
}
