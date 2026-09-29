import Link from "next/link";
import { notFound } from "next/navigation";
import { POStatus } from "@prisma/client";
import { requireVendorPortal, getVendorOrder } from "@/lib/vendor-portal";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/chain";
import { formatUsd } from "@/lib/units";
import { OrderResponse, VendorCommentBox } from "../../order-response";
import { InvoiceForm } from "../../invoice-form";
import { VendorShell } from "../../shell";

export const dynamic = "force-dynamic";

export default async function VendorOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, vendorIds } = await requireVendorPortal();
  const order = await getVendorOrder(id, vendorIds);
  if (!order) notFound();

  const awaitingResponse = order.status === POStatus.ISSUED;

  return (
    <VendorShell user={user}>
      <Link
        href="/vendor"
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Your orders
      </Link>

      <header className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mono text-[19px] font-semibold tracking-tight">
            {order.poNumber}
          </h1>
          <div className="mt-1 text-[13px] text-slate-500">
            from {order.org.name} · issued{" "}
            {order.createdAt.toLocaleDateString("en-GB")} ·{" "}
            {order.vendor.paymentTerms}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-[22px] font-semibold text-slate-900">
            {formatUsd(order.amountMinor)}
          </div>
          <div className="text-[11px] text-slate-400">to be paid in USDC</div>
        </div>
      </header>

      {awaitingResponse && (
        <div className="mb-4">
          <OrderResponse orderId={order.id} />
        </div>
      )}

      {order.status === POStatus.VENDOR_ACCEPTED && !order.receipt && (
        <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[12px] leading-relaxed text-teal-900">
          You&apos;ve accepted this order. {order.org.name} confirms delivery
          next — you&apos;ll be emailed the moment they do, and you can invoice
          from here. An invoice raised before then has nothing to match
          against.
        </div>
      )}

      {order.receipt && !order.invoice && (
        <div className="mb-4">
          <InvoiceForm
            orderId={order.id}
            poNumber={order.poNumber}
            orderedMinor={order.amountMinor.toString()}
            toleranceBps={order.toleranceBps}
            orgName={order.org.name}
          />
        </div>
      )}

      {order.invoice && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[12px] font-medium text-slate-900">
            Your invoice
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-3 text-[13px]">
            <span className="mono text-slate-900">
              {order.invoice.vendorInvoiceNumber}
            </span>
            <span className="tabular font-semibold text-slate-900">
              {formatUsd(order.invoice.invoicedAmountMinor)}
            </span>
          </div>
          {order.invoice.note && (
            <p className="mt-1 text-[12px] text-slate-600">
              {order.invoice.note}
            </p>
          )}
          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
            {order.invoice.invoicedAmountMinor === order.amountMinor
              ? `Agrees exactly with ${order.poNumber}.`
              : `Ordered ${formatUsd(order.amountMinor)} · invoiced ${formatUsd(order.invoice.invoicedAmountMinor)}. ${order.org.name} resolves any difference before payment.`}
          </p>
        </div>
      )}

      {order.status === POStatus.VENDOR_REJECTED && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          You rejected this order
          {order.vendorResponseReason && ` — ${order.vendorResponseReason}`}
        </div>
      )}

      {/* Lines */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Description</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {order.request.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{l.description}</td>
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
              <td className="px-4 py-3 text-slate-500" colSpan={3}>
                Total
              </td>
              <td className="tabular px-4 py-3 text-right text-slate-900">
                {formatUsd(order.amountMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Where it stands */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          Progress
        </div>
        <ol className="space-y-1.5 text-[12px]">
          <Stage done label="Order issued to you" />
          <Stage
            done={order.status !== POStatus.ISSUED}
            label="You accepted"
            detail={
              order.vendorResponseAt
                ? order.vendorResponseAt.toLocaleString("en-GB")
                : "waiting on you"
            }
          />
          <Stage
            done={!!order.receipt}
            label={`${order.org.name} confirmed delivery`}
            detail={order.receipt ? order.receipt.grnNumber : "not yet"}
          />
          <Stage
            done={!!order.invoice}
            label="Your invoice submitted"
            detail={
              order.invoice
                ? `${order.invoice.vendorInvoiceNumber} · ${formatUsd(order.invoice.invoicedAmountMinor)}`
                : "after delivery is confirmed"
            }
          />
          <Stage
            done={order.bill?.payment?.status === "CONFIRMED"}
            label="Paid"
            detail={
              order.bill?.payment?.txHash ? (
                <a
                  href={explorerTx(order.bill.payment.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-teal-700 hover:underline"
                >
                  {shortAddress(order.bill.payment.txHash)} ↗
                </a>
              ) : (
                "on match of order, delivery and invoice"
              )
            }
          />
        </ol>

        <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          Paid to{" "}
          <a
            href={explorerAddress(order.vendor.payoutAddress)}
            target="_blank"
            rel="noreferrer"
            className="mono text-teal-700 hover:underline"
          >
            {shortAddress(order.vendor.payoutAddress)} ↗
          </a>{" "}
          · settlement happens automatically when your invoice matches this
          order and the confirmed delivery.
        </div>
      </div>

      {/* Comments */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          Messages
        </div>
        {order.comments.length === 0 ? (
          <p className="mb-3 text-[12px] text-slate-500">
            Nothing yet. Anything you post here is visible to{" "}
            {order.org.name}.
          </p>
        ) : (
          <ul className="mb-3 space-y-2">
            {order.comments.map((c) => (
              <li key={c.id} className="text-[12px]">
                <span
                  className={
                    c.author === "VENDOR"
                      ? "font-medium text-teal-700"
                      : "font-medium text-indigo-700"
                  }
                >
                  {c.author === "VENDOR" ? "You" : order.org.name}
                </span>
                <span className="ml-2 text-slate-400">
                  {c.createdAt.toLocaleString("en-GB")}
                </span>
                <div className="text-slate-700">{c.body}</div>
              </li>
            ))}
          </ul>
        )}
        <VendorCommentBox orderId={order.id} />
      </div>
    </VendorShell>
  );
}

function Stage({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail?: React.ReactNode;
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
        {detail && <span className="ml-2 text-slate-400">{detail}</span>}
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
