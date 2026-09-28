import Link from "next/link";
import { PRStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";

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

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgAccess(slug);

  const requests = await db.purchaseRequest.findMany({
    where: { orgId: org.id },
    include: {
      vendor: { select: { name: true } },
      department: { select: { code: true, name: true } },
      requester: { select: { name: true, email: true } },
      approvals: { select: { id: true, approved: true } },
      order: { select: { poNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Purchase requests
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            What someone has asked to buy, and where it is in approval.
          </p>
        </div>
        <Link
          href={`/o/${slug}/requests/new`}
          className="shrink-0 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
        >
          New request
        </Link>
      </header>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No requests yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            A purchase request is the start of the cycle: someone asks, an
            approver signs off, and it becomes a purchase order.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Number</Th>
                <Th>Vendor</Th>
                <Th>Department</Th>
                <Th>Requester</Th>
                <Th align="right">Amount</Th>
                <Th>Approvals</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const given = r.approvals.filter((a) => a.approved).length;
                const s = STATUS[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/o/${slug}/requests/${r.id}`}
                        className="mono font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline"
                      >
                        {r.prNumber}
                      </Link>
                      {r.order && (
                        <div className="mono text-[11px] text-slate-400">
                          → {r.order.poNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{r.vendor.name}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-[12px] text-slate-500">
                        {r.department.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-600">
                      {r.requester.name ?? r.requester.email}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-slate-900">
                      {formatUsd(r.amountMinor)}
                    </td>
                    <td className="px-4 py-3">
                      {r.approvalsRequired === 0 ? (
                        <span className="text-[12px] text-slate-400">
                          Auto
                        </span>
                      ) : (
                        <span className="tabular text-[12px] text-slate-600">
                          {given} of {r.approvalsRequired}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.tone}`}
                      >
                        {s.label}
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
