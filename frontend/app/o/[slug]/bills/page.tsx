import Link from "next/link";
import { BillStatus, POStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";

export const dynamic = "force-dynamic";

export const BILL_STATUS: Record<BillStatus, { label: string; tone: string }> = {
  RECEIVED: {
    label: "Received",
    tone: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  MATCHING: {
    label: "Matching",
    tone: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  MATCH_FAILED: {
    label: "Match failed",
    tone: "bg-red-50 text-red-700 ring-red-600/20",
  },
  MATCHED: {
    label: "Matched",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  SCHEDULED: {
    label: "Scheduled",
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  },
  PAID: { label: "Paid", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  DISPUTED: {
    label: "Disputed",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
};

export default async function BillsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgAccess(slug);

  const [bills, billable] = await Promise.all([
    db.bill.findMany({
      where: { orgId: org.id },
      include: {
        order: {
          select: {
            id: true,
            poNumber: true,
            vendor: { select: { name: true } },
            department: { select: { code: true } },
          },
        },
        payment: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Everything the vendor has invoiced that nobody has matched yet.
    db.purchaseOrder.findMany({
      where: {
        orgId: org.id,
        bill: null,
        invoice: { isNot: null },
        status: { notIn: [POStatus.CANCELLED, POStatus.VENDOR_REJECTED] },
      },
      include: {
        vendor: { select: { name: true } },
        invoice: { select: { vendorInvoiceNumber: true, invoicedAmountMinor: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const payable = bills
    .filter((b) => b.status === BillStatus.MATCHED && !b.payment)
    .reduce((s, b) => s + b.invoicedAmountMinor, 0n);
  const blocked = bills.filter((b) => b.status === BillStatus.MATCH_FAILED);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Bills</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            A vendor invoice matched against its order and its receipt. Only a
            matched bill can be paid.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {formatUsd(payable)}
          </div>
          <div className="text-[11px] text-slate-400">
            matched and awaiting payment
          </div>
        </div>
      </header>

      {blocked.length > 0 && (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {blocked.length} bill{blocked.length === 1 ? "" : "s"} failed the
          match and cannot be paid — {blocked.map((b) => b.billNumber).join(", ")}
        </div>
      )}

      {billable.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-[13px] font-medium text-slate-900">
            Invoiced, not yet matched
          </h2>
          <div className="overflow-hidden rounded-lg border border-indigo-200 bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-indigo-200 bg-indigo-50">
                  <Th>Order</Th>
                  <Th>Vendor</Th>
                  <Th>Their invoice</Th>
                  <Th align="right">Ordered</Th>
                  <Th align="right">Invoiced</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {billable.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="mono px-4 py-3 text-slate-900">
                      {o.poNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{o.vendor.name}</td>
                    <td className="mono px-4 py-3 text-[12px] text-slate-500">
                      {o.invoice!.vendorInvoiceNumber}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-600">
                      {formatUsd(o.amountMinor)}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-900">
                      {formatUsd(o.invoice!.invoicedAmountMinor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/o/${slug}/orders/${o.id}`}
                        className="text-[12px] font-medium text-indigo-700 underline-offset-2 hover:underline"
                      >
                        Raise bill →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No bills yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            A bill is raised once the vendor has invoiced an order you&apos;ve
            confirmed as received. Raising it runs the three-way match.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Bill</Th>
                <Th>Order</Th>
                <Th>Vendor</Th>
                <Th align="right">Ordered</Th>
                <Th align="right">Invoiced</Th>
                <Th align="right">Variance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const st = BILL_STATUS[b.status];
                const delta = b.invoicedAmountMinor - b.poAmountMinor;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/o/${slug}/bills/${b.id}`}
                        className="mono font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline"
                      >
                        {b.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/o/${slug}/orders/${b.order.id}`}
                        className="mono text-slate-600 underline-offset-2 hover:text-indigo-700 hover:underline"
                      >
                        {b.order.poNumber}
                      </Link>
                      <div className="mono text-[11px] text-slate-400">
                        {b.order.department.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {b.order.vendor.name}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-600">
                      {formatUsd(b.poAmountMinor)}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-900">
                      {formatUsd(b.invoicedAmountMinor)}
                    </td>
                    <td
                      className={`tabular px-4 py-3 text-right ${
                        delta === 0n
                          ? "text-slate-400"
                          : b.status === BillStatus.MATCH_FAILED
                            ? "text-red-700"
                            : "text-amber-700"
                      }`}
                    >
                      {delta === 0n
                        ? "—"
                        : `${delta > 0n ? "+" : "−"}${formatUsd(delta < 0n ? -delta : delta)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.tone}`}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
