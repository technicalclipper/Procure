import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { pendingForUser, readSnapshot } from "@/lib/procurement/approvals";

export const dynamic = "force-dynamic";

export default async function ApprovalsQueue({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user } = await requireOrgAccess(slug);

  const [mine, allOpen] = await Promise.all([
    pendingForUser(org.id, user.id),
    db.purchaseRequest.count({
      where: { orgId: org.id, status: "PENDING_APPROVAL" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Approvals
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Requests waiting on your signature right now.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {mine.length}
          </div>
          <div className="text-[11px] text-slate-400">
            awaiting you{allOpen !== mine.length && ` of ${allOpen} open`}
          </div>
        </div>
      </header>

      {mine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            Nothing waiting on you
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            {allOpen > 0
              ? `${allOpen} request${allOpen === 1 ? " is" : "s are"} open, but at a level you're not an approver on — or you've already signed.`
              : "No requests are awaiting approval."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {mine.map((pr) => {
            const snapshot = readSnapshot(pr.flowSnapshot);
            const level = snapshot?.levels.find(
              (l) => l.position === pr.currentLevel,
            );
            const given = pr.approvals.filter(
              (a) => a.level === pr.currentLevel && a.approved,
            ).length;
            return (
              <li key={pr.id}>
                <Link
                  href={`/o/${slug}/requests/${pr.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[13px] font-medium text-slate-900">
                        {pr.prNumber}
                      </span>
                      <span className="text-[13px] text-slate-700">
                        {pr.vendor.name}
                      </span>
                      <span className="mono text-[11px] text-slate-400">
                        {pr.department.code}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      raised by {pr.requester.name ?? pr.requester.email}
                      {level && (
                        <>
                          {" · "}Level {level.position}
                          {level.name ? ` ${level.name}` : ""} — {given} of{" "}
                          {level.required} signed
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-[15px] font-semibold text-slate-900">
                      {formatUsd(pr.amountMinor)}
                    </div>
                    <div className="text-[11px] text-indigo-600">
                      Review →
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
