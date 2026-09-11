import Link from "next/link";
import { notFound } from "next/navigation";
import { PRStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { budgetPosition } from "@/lib/procurement/precheck";

export const dynamic = "force-dynamic";

const STATUS: Record<PRStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  SUBMITTED: {
    label: "Submitted",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  PRECHECK_FAILED: {
    label: "Blocked",
    tone: "bg-red-50 text-red-700 ring-red-600/20",
  },
  PENDING_APPROVAL: {
    label: "Awaiting approval",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  APPROVED: {
    label: "Approved",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  REJECTED: { label: "Rejected", tone: "bg-red-50 text-red-700 ring-red-600/20" },
};

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { org } = await requireOrgAccess(slug);

  const pr = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      lines: { include: { item: true } },
      vendor: true,
      department: true,
      requester: true,
      approvals: { include: { approver: true }, orderBy: { createdAt: "asc" } },
      order: true,
    },
  });

  if (!pr || pr.orgId !== org.id) notFound();

  const budget = await budgetPosition(pr.departmentId);
  const given = pr.approvals.filter((a) => a.approved).length;
  const s = STATUS[pr.status];

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <Link
        href={`/o/${slug}/requests`}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Requests
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="mono text-[19px] font-semibold tracking-tight">
              {pr.prNumber}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.tone}`}
            >
              {s.label}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-slate-500">
            {pr.vendor.name} · {pr.department.name} · raised by{" "}
            {pr.requester.name ?? pr.requester.email}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-[22px] font-semibold text-slate-900">
            {formatUsd(pr.amountMinor)}
          </div>
          <div className="text-[11px] text-slate-400">
            {pr.approvalsRequired === 0
              ? "auto-approved"
              : `${given} of ${pr.approvalsRequired} approvals`}
          </div>
        </div>
      </header>

      {pr.order && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          Issued as{" "}
          <Link
            href={`/o/${slug}/orders/${pr.order.id}`}
            className="mono font-medium underline"
          >
            {pr.order.poNumber}
          </Link>
        </div>
      )}

      {pr.justification && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Justification
          </div>
          <p className="mt-1 text-[13px] text-slate-700">{pr.justification}</p>
        </div>
      )}

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
            {pr.lines.map((l) => (
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
                    <span className="text-[11px] text-amber-700">
                      manual coding
                    </span>
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
                Total
              </td>
              <td className="tabular px-4 py-3 text-right text-slate-900">
                {formatUsd(pr.amountMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Budget position */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          {pr.department.name} budget
        </div>
        <div className="grid grid-cols-4 gap-3 text-[12px]">
          <Stat label="Allocated" value={formatUsd(budget.allocated)} />
          <Stat label="Committed" value={formatUsd(budget.encumbered)} />
          <Stat label="Spent" value={formatUsd(budget.spent)} />
          <Stat label="Available" value={formatUsd(budget.available)} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Committed is the total on open purchase orders. Approving a request
          commits budget; paying it merely settles what was already
          committed.
        </p>
      </div>

      {/* Approvals */}
      {pr.approvalsRequired > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-[12px] font-medium text-slate-900">
            Approvals
          </div>
          {pr.approvals.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              Nobody has signed off yet. {pr.approvalsRequired} approval
              {pr.approvalsRequired === 1 ? "" : "s"} needed before this
              becomes a purchase order.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {pr.approvals.map((a) => (
                <li key={a.id} className="flex gap-2 text-[12px]">
                  <span className={a.approved ? "text-emerald-600" : "text-red-600"}>
                    {a.approved ? "✓" : "✕"}
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-900">
                      {a.approver.name ?? a.approver.email}
                    </span>{" "}
                    {a.approved ? "approved" : "rejected"}{" "}
                    {a.createdAt.toLocaleString("en-GB")}
                    {a.comment && ` — ${a.comment}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="tabular mt-0.5 text-[14px] font-medium text-slate-900">
        {value}
      </div>
    </div>
  );
}
