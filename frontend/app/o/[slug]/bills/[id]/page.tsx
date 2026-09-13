import Link from "next/link";
import { notFound } from "next/navigation";
import { BillStatus, MatchOutcome, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { runThreeWayMatch } from "@/lib/procurement/three-way";
import { explorerAddress, explorerTx, shortAddress, arcTestnet } from "@/lib/chain";
import { RematchBill } from "../bill-controls";
import { PayBill } from "../pay-controls";
import { payabilityReport } from "@/lib/procurement/payment";
import { BILL_STATUS } from "../page";

export const dynamic = "force-dynamic";

export default async function BillDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  const [bill, purchaser] = await Promise.all([
    db.bill.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            vendor: true,
            department: true,
            receipt: { include: { receivedBy: true } },
            invoice: true,
            request: { include: { lines: true } },
          },
        },
        matches: { orderBy: { createdAt: "desc" } },
        payment: true,
      },
    }),
    db.membership.findFirst({
      where: { userId: user.id, role: Role.PURCHASER, department: { orgId: org.id } },
      select: { id: true },
    }),
  ]);

  if (!bill || bill.orgId !== org.id) notFound();

  const canAct = canManage || !!purchaser;
  const st = BILL_STATUS[bill.status];
  const latest = bill.matches[0];

  // Re-run live so the page shows the world as it is now, not only as it
  // was when the bill was raised. The persisted MatchResult remains the
  // record of the decision; this is the current reading beside it.
  const current = runThreeWayMatch(bill.order);

  // What Arc currently believes — signatures it would accept, the
  // threshold it holds. Read here so the button can state the position
  // rather than discovering it in a revert.
  const report = await payabilityReport(bill.id);
  const drifted = latest && current.passed !== (latest.outcome === MatchOutcome.PASS);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <Link
        href={`/o/${slug}/bills`}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Bills
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="mono text-[19px] font-semibold tracking-tight">
              {bill.billNumber}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.tone}`}
            >
              {st.label}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-slate-500">
            {bill.order.vendor.name} ·{" "}
            <Link
              href={`/o/${slug}/orders/${bill.order.id}`}
              className="mono underline-offset-2 hover:underline"
            >
              {bill.order.poNumber}
            </Link>{" "}
            · {bill.order.department.name}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-[22px] font-semibold text-slate-900">
            {formatUsd(bill.invoicedAmountMinor)}
          </div>
          <div className="text-[11px] text-slate-400">
            invoiced · ordered {formatUsd(bill.poAmountMinor)}
          </div>
        </div>
      </header>

      {/* The verdict */}
      <div
        className={`rounded-lg border p-4 ${
          bill.status === BillStatus.MATCHED
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-red-200 bg-red-50/60"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div
            className={`text-[13px] font-medium ${
              bill.status === BillStatus.MATCHED
                ? "text-emerald-900"
                : "text-red-900"
            }`}
          >
            Three-way match {bill.status === BillStatus.MATCHED ? "passed" : "failed"}
          </div>
          {latest && (
            <div className="text-[11px] text-slate-500">
              {latest.createdAt.toLocaleString("en-GB")}
              {bill.matches.length > 1 && ` · run ${bill.matches.length} times`}
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {current.checks.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span
                className={`mt-0.5 text-[13px] ${c.passed ? "text-emerald-600" : "text-red-600"}`}
              >
                {c.passed ? "✓" : "✕"}
              </span>
              <div>
                <div
                  className={`text-[13px] ${
                    c.passed ? "text-slate-900" : "font-medium text-red-800"
                  }`}
                >
                  {c.label}
                </div>
                <div className="text-[12px] leading-relaxed text-slate-600">
                  {c.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <p
          className={`mt-3 border-t pt-3 text-[12px] leading-relaxed ${
            bill.status === BillStatus.MATCHED
              ? "border-emerald-900/10 text-emerald-900"
              : "border-red-900/10 text-red-900"
          }`}
        >
          {bill.status === BillStatus.MATCHED
            ? "All three legs agree. This bill is payable — the match is the authorisation, so no further sign-off is needed."
            : "Payment is blocked. Nothing can be paid against this bill until every check passes — this isn't a warning that can be clicked past."}
        </p>

        {drifted && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Something has changed since this was last matched — the checks
            above read differently now. Re-run the match to record the new
            outcome.
          </div>
        )}

        {canAct && !bill.payment && bill.status !== BillStatus.MATCHED && (
          <div className="mt-3">
            <RematchBill slug={slug} billId={bill.id} />
          </div>
        )}
        {canAct && drifted && bill.status === BillStatus.MATCHED && (
          <div className="mt-3">
            <RematchBill slug={slug} billId={bill.id} />
          </div>
        )}
      </div>

      {/* The three documents */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Doc
          label="Ordered"
          number={bill.order.poNumber}
          amount={formatUsd(bill.poAmountMinor)}
          detail={`${bill.order.createdAt.toLocaleDateString("en-GB")} · tolerance ${(bill.order.toleranceBps / 100).toFixed(2)}%`}
          href={`/o/${slug}/orders/${bill.order.id}`}
        />
        <Doc
          label="Received"
          number={bill.order.receipt?.grnNumber ?? "—"}
          amount={bill.order.receipt ? "confirmed" : "not received"}
          detail={
            bill.order.receipt
              ? `${bill.order.receipt.createdAt.toLocaleDateString("en-GB")} · ${bill.order.receipt.receivedBy.name ?? bill.order.receipt.receivedBy.email}`
              : "nobody has confirmed delivery"
          }
        />
        <Doc
          label="Invoiced"
          number={bill.order.invoice?.vendorInvoiceNumber ?? "—"}
          amount={
            bill.order.invoice
              ? formatUsd(bill.order.invoice.invoicedAmountMinor)
              : "—"
          }
          detail={
            bill.order.invoice
              ? `${bill.order.invoice.createdAt.toLocaleDateString("en-GB")} · from ${bill.order.vendor.name}`
              : "vendor has not invoiced"
          }
        />
      </div>

      {bill.order.invoice?.note && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700">
          <span className="text-slate-500">
            Note from {bill.order.vendor.name}:
          </span>{" "}
          {bill.order.invoice.note}
        </div>
      )}

      {/* Where it would go */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          Payment
        </div>
        {bill.payment?.txHash ? (
          <div className="text-[12px] text-slate-700">
            <span className="font-medium text-emerald-700">
              {bill.payment.status.toLowerCase()}
            </span>{" "}
            · {formatUsd(bill.payment.amountMinor)} to{" "}
            <a
              href={explorerAddress(bill.payment.toAddress)}
              target="_blank"
              rel="noreferrer"
              className="mono text-indigo-700 hover:underline"
            >
              {shortAddress(bill.payment.toAddress)} ↗
            </a>
            <div className="mt-1">
              <a
                href={explorerTx(bill.payment.txHash)}
                target="_blank"
                rel="noreferrer"
                className="mono text-[11px] text-indigo-700 underline underline-offset-2"
              >
                {bill.payment.txHash.slice(0, 22)}… ↗
              </a>
              {bill.payment.blockNumber != null && (
                <span className="ml-2 text-[11px] text-slate-400">
                  block {bill.payment.blockNumber.toString()}
                </span>
              )}
            </div>
          </div>
        ) : bill.status === BillStatus.MATCHED && canAct ? (
          <PayBill
            slug={slug}
            billId={bill.id}
            amount={formatUsd(bill.invoicedAmountMinor)}
            vendorName={bill.order.vendor.name}
            signaturesOnFile={report?.signatures.length ?? 0}
            signaturesRequired={report?.onchain?.threshold ?? 0}
            explorerBase={arcTestnet.blockExplorers?.default.url ?? ""}
          />
        ) : (
          <p className="text-[12px] leading-relaxed text-slate-600">
            {bill.status === BillStatus.MATCHED
              ? `Payable to ${shortAddress(bill.order.vendor.payoutAddress)} — a purchaser or controller releases it.`
              : "Unreachable while the match is failing. This isn't a disabled button; the contract has nothing to pay against."}
            {bill.payment?.failReason && (
              <span className="mt-1 block text-red-700">
                Last attempt failed: {bill.payment.failReason}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Audit trail */}
      {bill.matches.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-[12px] font-medium text-slate-900">
            Match history
          </div>
          <ul className="space-y-2">
            {bill.matches.map((m) => (
              <li key={m.id} className="text-[12px]">
                <span
                  className={
                    m.outcome === MatchOutcome.PASS
                      ? "font-medium text-emerald-700"
                      : "font-medium text-red-700"
                  }
                >
                  {m.outcome}
                </span>
                <span className="ml-2 text-slate-400">
                  {m.createdAt.toLocaleString("en-GB")}
                </span>
                <span className="tabular ml-2 text-slate-500">
                  variance{" "}
                  {m.varianceMinor === 0n
                    ? "—"
                    : `${m.varianceMinor > 0n ? "+" : "−"}${formatUsd(m.varianceMinor < 0n ? -m.varianceMinor : m.varianceMinor)}`}{" "}
                  · tolerance {formatUsd(m.toleranceMinor)}
                </span>
                <div className="text-slate-700">{m.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Doc({
  label,
  number,
  amount,
  detail,
  href,
}: {
  label: string;
  number: string;
  amount: string;
  detail: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mono mt-0.5 text-[13px] font-medium text-slate-900">
        {number}
      </div>
      <div className="tabular text-[13px] text-slate-700">{amount}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
        {detail}
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-indigo-300"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-slate-200 bg-white p-3">{body}</div>
  );
}
