import Link from "next/link";
import { POStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";

export const dynamic = "force-dynamic";

/**
 * Goods receipts, and what is still waiting for one.
 *
 * The outstanding list matters more than the history: an accepted order
 * with no receipt is the gap where money is committed, the vendor may be
 * waiting to invoice, and nobody has said whether anything actually
 * arrived.
 */
export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  const [receipts, outstanding, myDepts] = await Promise.all([
    db.goodsReceipt.findMany({
      where: { orgId: org.id },
      include: {
        receivedBy: { select: { name: true, email: true } },
        order: {
          select: {
            id: true,
            poNumber: true,
            amountMinor: true,
            vendor: { select: { name: true } },
            department: { select: { code: true } },
            invoice: { select: { id: true } },
            bill: { select: { billNumber: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.purchaseOrder.findMany({
      where: {
        orgId: org.id,
        receipt: null,
        status: { in: [POStatus.VENDOR_ACCEPTED, POStatus.RECEIVED] },
      },
      include: {
        vendor: { select: { name: true } },
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.membership.findMany({
      where: { userId: user.id, role: Role.REQUESTER, department: { orgId: org.id } },
      select: { departmentId: true },
    }),
  ]);

  const mine = new Set(myDepts.map((m) => m.departmentId));
  const awaitingTotal = outstanding.reduce((s, o) => s + o.amountMinor, 0n);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Goods receipts
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Confirmation that what was ordered actually arrived — the second
            leg of the three-way match.
          </p>
        </div>
        {outstanding.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="tabular text-[19px] font-semibold text-slate-900">
              {formatUsd(awaitingTotal)}
            </div>
            <div className="text-[11px] text-slate-400">
              awaiting confirmation
            </div>
          </div>
        )}
      </header>

      {outstanding.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-[13px] font-medium text-slate-900">
            Waiting to be received
          </h2>
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-50">
                  <Th>Order</Th>
                  <Th>Vendor</Th>
                  <Th>Dept</Th>
                  <Th align="right">Amount</Th>
                  <Th>Waiting since</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {outstanding.map((o) => {
                  const yours = canManage || mine.has(o.department.id);
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
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {o.vendor.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="mono text-[12px] text-slate-500">
                          {o.department.code}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-900">
                        {formatUsd(o.amountMinor)}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">
                        {o.createdAt.toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {yours ? (
                          <Link
                            href={`/o/${slug}/orders/${o.id}`}
                            className="text-[12px] font-medium text-emerald-700 underline-offset-2 hover:underline"
                          >
                            Confirm receipt →
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {o.department.name} confirms
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="mb-2 text-[13px] font-medium text-slate-900">Received</h2>

      {receipts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            Nothing received yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            A receipt is recorded from the purchase order once the vendor has
            accepted it and the goods have arrived. It&apos;s what lets them
            invoice.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Receipt</Th>
                <Th>Order</Th>
                <Th>Vendor</Th>
                <Th align="right">Amount</Th>
                <Th>Confirmed by</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <span className="mono font-medium text-slate-900">
                      {r.grnNumber}
                    </span>
                    {r.note && (
                      <div className="max-w-xs truncate text-[11px] text-slate-400">
                        {r.note}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/o/${slug}/orders/${r.order.id}`}
                      className="mono text-slate-600 underline-offset-2 hover:text-indigo-700 hover:underline"
                    >
                      {r.order.poNumber}
                    </Link>
                    <div className="mono text-[11px] text-slate-400">
                      {r.order.department.code}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {r.order.vendor.name}
                  </td>
                  <td className="tabular px-4 py-3 text-right text-slate-900">
                    {formatUsd(r.order.amountMinor)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-600">
                    {r.receivedBy.name ?? r.receivedBy.email}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">
                    {r.createdAt.toLocaleDateString("en-GB")}
                    <div className="text-[11px]">
                      {r.order.bill ? (
                        <span className="text-emerald-700">
                          {r.order.bill.billNumber}
                        </span>
                      ) : r.order.invoice ? (
                        <span className="text-sky-700">invoice in</span>
                      ) : (
                        <span className="text-slate-400">
                          awaiting invoice
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
