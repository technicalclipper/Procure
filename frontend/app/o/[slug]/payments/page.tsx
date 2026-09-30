import Link from "next/link";
import { PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/chain";
import { registryAddress } from "@/lib/registry";

export const dynamic = "force-dynamic";

const TONE: Record<PaymentStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600 ring-slate-500/20",
  SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
};

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgAccess(slug);

  const payments = await db.payment.findMany({
    where: { bill: { orgId: org.id } },
    include: {
      bill: {
        select: {
          id: true,
          billNumber: true,
          order: {
            select: { poNumber: true, vendor: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const settled = payments
    .filter((p) => p.status === PaymentStatus.CONFIRMED)
    .reduce((s, p) => s + p.amountMinor, 0n);

  const registry = registryAddress();

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Payments</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            USDC settled on Arc. Every one had to clear the three-way match
            and the approver signatures the contract holds.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {formatUsd(settled)}
          </div>
          <div className="text-[11px] text-slate-400">settled</div>
        </div>
      </header>

      {registry && (
        <div className="mb-5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
          Enforced by{" "}
          <a
            href={explorerAddress(registry)}
            target="_blank"
            rel="noreferrer"
            className="mono text-indigo-700 hover:underline"
          >
            {shortAddress(registry)} ↗
          </a>{" "}
          on Arc testnet — it verifies the approver signatures, the vendor
          allowlist and the budget before releasing anything.
        </div>
      )}

      {payments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            Nothing paid yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            A payment is released from a matched bill. It settles in USDC on
            Arc, and the contract re-checks the signatures before it moves.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Bill</Th>
                <Th>Vendor</Th>
                <Th align="right">Amount</Th>
                <Th>To</Th>
                <Th>Transaction</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/o/${slug}/bills/${p.bill.id}`}
                      className="mono font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline"
                    >
                      {p.bill.billNumber}
                    </Link>
                    <div className="mono text-[11px] text-slate-400">
                      {p.bill.order.poNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {p.bill.order.vendor.name}
                  </td>
                  <td className="tabular px-4 py-3 text-right text-slate-900">
                    {formatUsd(p.amountMinor)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={explorerAddress(p.toAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[12px] text-indigo-700 hover:underline"
                    >
                      {shortAddress(p.toAddress)} ↗
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {p.txHash ? (
                      <a
                        href={explorerTx(p.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-[12px] text-indigo-700 hover:underline"
                      >
                        {p.txHash.slice(0, 14)}… ↗
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {p.failReason ? "reverted" : "—"}
                      </span>
                    )}
                    {p.blockNumber != null && (
                      <div className="text-[11px] text-slate-400">
                        block {p.blockNumber.toString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[p.status]}`}
                    >
                      {p.status.toLowerCase()}
                    </span>
                    {p.failReason && (
                      <div className="mt-0.5 max-w-xs truncate text-[11px] text-red-600" title={p.failReason}>
                        {p.failReason}
                      </div>
                    )}
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
