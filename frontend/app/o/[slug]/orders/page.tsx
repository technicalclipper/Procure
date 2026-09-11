import Link from "next/link";
import { POStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";

export const dynamic = "force-dynamic";

export const PO_STATUS: Record<POStatus, { label: string; tone: string }> = {
  ISSUED: {
    label: "Issued",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  VENDOR_ACCEPTED: {
    label: "Accepted",
    tone: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  VENDOR_REJECTED: {
    label: "Rejected by vendor",
    tone: "bg-red-50 text-red-700 ring-red-600/20",
  },
  RECEIVED: {
    label: "Received",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  CLOSED: {
    label: "Closed",
    tone: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "bg-slate-100 text-slate-500 ring-slate-500/20",
  },
};

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgAccess(slug);

  const orders = await db.purchaseOrder.findMany({
    where: { orgId: org.id },
    include: {
      vendor: { select: { name: true } },
      department: { select: { code: true } },
      request: { select: { prNumber: true } },
      receipt: { select: { id: true } },
      bill: { select: { id: true, billNumber: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const committed = orders
    .filter(
      (o) =>
        o.status !== POStatus.CANCELLED && o.status !== POStatus.VENDOR_REJECTED,
    )
    .reduce((s, o) => s + o.amountMinor, 0n);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Purchase orders
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            What the organisation has actually committed to buy.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {formatUsd(committed)}
          </div>
          <div className="text-[11px] text-slate-400">committed</div>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No purchase orders yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            An order is issued from an approved request. That is the moment
            budget is committed and the vendor is told what to supply.
          </p>
          <Link
            href={`/o/${slug}/requests`}
            className="mt-4 inline-block text-[12px] text-indigo-600 underline-offset-2 hover:underline"
          >
            Go to requests
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Number</Th>
                <Th>Vendor</Th>
                <Th>Dept</Th>
                <Th align="right">Amount</Th>
                <Th>Progress</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const st = PO_STATUS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/o/${slug}/orders/${o.id}`}
                        className="mono font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline"
                      >
                        {o.poNumber}
                      </Link>
                      <div className="mono text-[11px] text-slate-400">
                        from {o.request.prNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{o.vendor.name}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-[12px] text-slate-500">
                        {o.department.code}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-900">
                      {formatUsd(o.amountMinor)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Step done={o.status !== POStatus.ISSUED} label="Accepted" />
                        <Step done={!!o.receipt} label="Received" />
                        <Step done={!!o.bill} label="Billed" />
                      </div>
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

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={
        done
          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
          : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-400"
      }
    >
      {done ? "✓" : "○"} {label}
    </span>
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
