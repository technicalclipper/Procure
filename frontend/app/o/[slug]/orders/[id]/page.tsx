import Link from "next/link";
import { notFound } from "next/navigation";
import { POStatus, Role, VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { CancelOrder } from "../order-controls";
import { PO_STATUS } from "../page";

export const dynamic = "force-dynamic";

export default async function OrderDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  const [order, purchaser] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        department: true,
        request: { include: { lines: { include: { item: true } }, requester: true } },
        receipt: { include: { receivedBy: true } },
        invoice: true,
        bill: true,
        comments: { orderBy: { createdAt: "asc" } },
      },
    }),
    db.membership.findFirst({
      where: {
        userId: user.id,
        role: Role.PURCHASER,
        department: { orgId: org.id },
      },
      select: { id: true },
    }),
  ]);

  if (!order || order.orgId !== org.id) notFound();

  const canEdit = canManage || !!purchaser;
  const st = PO_STATUS[order.status];
  const open =
    order.status !== POStatus.CANCELLED &&
    order.status !== POStatus.VENDOR_REJECTED;

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <Link
        href={`/o/${slug}/orders`}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Purchase orders
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="mono text-[19px] font-semibold tracking-tight">
              {order.poNumber}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.tone}`}
            >
              {st.label}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-slate-500">
            {order.vendor.name} · {order.department.name} · from{" "}
            <Link
              href={`/o/${slug}/requests/${order.requestId}`}
              className="mono underline-offset-2 hover:underline"
            >
              {order.request.prNumber}
            </Link>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-[22px] font-semibold text-slate-900">
            {formatUsd(order.amountMinor)}
          </div>
          <div className="text-[11px] text-slate-400">
            tolerance {(order.toleranceBps / 100).toFixed(2)}%
          </div>
        </div>
      </header>

      {/* Where it is in the cycle */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          Progress
        </div>
        <ol className="space-y-1.5 text-[12px]">
          <Stage
            done
            label="Issued"
            detail={`${order.createdAt.toLocaleString("en-GB")} · sent to ${order.vendor.email}`}
          />
          <Stage
            done={order.status !== POStatus.ISSUED}
            label="Accepted by vendor"
            detail={
              order.vendorResponseAt
                ? order.vendorResponseAt.toLocaleString("en-GB")
                : order.vendor.portalStatus === VendorPortalStatus.ACTIVE
                  ? "Waiting on the vendor in their portal"
                  : "Vendor hasn't claimed their portal yet"
            }
          />
          <Stage
            done={!!order.receipt}
            label="Goods received"
            detail={
              order.receipt
                ? `${order.receipt.grnNumber} · confirmed by ${order.receipt.receivedBy.name ?? order.receipt.receivedBy.email}`
                : "Confirm once delivered"
            }
          />
          <Stage
            done={!!order.invoice}
            label="Invoice submitted"
            detail={
              order.invoice
                ? `${order.invoice.vendorInvoiceNumber} · ${formatUsd(order.invoice.invoicedAmountMinor)}`
                : "Vendor submits against this order"
            }
          />
          <Stage
            done={!!order.bill}
            label="Bill and three-way match"
            detail={
              order.bill
                ? `${order.bill.billNumber} · ${order.bill.status.toLowerCase().replace("_", " ")}`
                : "Compares this order, the receipt and the invoice"
            }
          />
        </ol>
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Description</Th>
              <Th>Codes to</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {order.request.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-slate-900">{l.description}</div>
                  {l.item && (
                    <div className="mono text-[11px] text-slate-400">
                      {l.item.code}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.expenseAccountCode ? (
                    <span className="mono text-[12px] text-slate-500">
                      {l.expenseAccountCode}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-700">manual</span>
                  )}
                </td>
                <td className="tabular px-4 py-3 text-right text-slate-600">
                  {l.quantity}
                </td>
                <td className="tabular px-4 py-3 text-right text-slate-600">
                  {formatUsd(l.unitRateMinor)}
                </td>
                <td className="tabular px-4 py-3 text-right text-slate-900">
                  {formatUsd(l.amountMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium">
              <td className="px-4 py-3 text-slate-500" colSpan={4}>
                Ordered total
              </td>
              <td className="tabular px-4 py-3 text-right text-slate-900">
                {formatUsd(order.amountMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.vendorResponseReason && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          Vendor response: {order.vendorResponseReason}
        </div>
      )}

      {order.comments.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-[12px] font-medium text-slate-900">
            Comments
          </div>
          <ul className="space-y-2">
            {order.comments.map((c) => (
              <li key={c.id} className="text-[12px]">
                <span
                  className={
                    c.author === "VENDOR"
                      ? "font-medium text-teal-700"
                      : "font-medium text-indigo-700"
                  }
                >
                  {c.author === "VENDOR" ? order.vendor.name : org.name}
                </span>
                <span className="ml-2 text-slate-400">
                  {c.createdAt.toLocaleString("en-GB")}
                </span>
                <div className="text-slate-700">{c.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && open && !order.bill && (
        <div className="mt-4">
          <CancelOrder slug={slug} orderId={order.id} />
        </div>
      )}
    </div>
  );
}

function Stage({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex gap-2">
      <span className={done ? "text-emerald-600" : "text-slate-300"}>
        {done ? "✓" : "○"}
      </span>
      <span>
        <span className={done ? "text-slate-900" : "text-slate-400"}>
          {label}
        </span>
        <span className="ml-2 text-slate-400">{detail}</span>
      </span>
    </li>
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
