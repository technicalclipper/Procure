import Link from "next/link";
import { requireOrgAccess } from "@/lib/org";
import { db } from "@/lib/db";
import { usdcBalanceOf, explorerAddress, shortAddress } from "@/lib/chain";
import { formatUsd } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function OrgHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, canManage } = await requireOrgAccess(slug);

  const [departments, counts, accountCount] = await Promise.all([
    db.department.findMany({
      where: { orgId: org.id },
      orderBy: { code: "asc" },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: {
        _count: { select: { members: true, vendors: true, items: true } },
      },
    }),
    db.account.count({ where: { orgId: org.id, active: true } }),
  ]);

  const treasuryBalance = org.treasuryAddress
    ? await usdcBalanceOf(org.treasuryAddress).catch(() => null)
    : null;

  const totalBudget = departments.reduce((s, d) => s + d.budgetMinor, 0n);

  const setupSteps = [
    {
      done: departments.length > 0,
      label: "Add departments and budgets",
      href: `/o/${slug}/settings/departments`,
    },
    {
      done: counts._count.members > 1,
      label: "Invite your team",
      href: `/o/${slug}/settings/people`,
    },
    {
      done: counts._count.vendors > 0,
      label: "Onboard a vendor",
      href: `/o/${slug}/vendors`,
    },
  ];
  const remaining = setupSteps.filter((s) => !s.done);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-7">
        <h1 className="text-[19px] font-semibold tracking-tight">
          {org.name}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Overview of your organisation&apos;s treasury, departments and
          master data.
        </p>
      </header>

      {canManage && remaining.length > 0 && (
        <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
          <div className="text-[13px] font-medium text-indigo-900">
            Finish setting up
          </div>
          <ul className="mt-2 space-y-1.5">
            {setupSteps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[12px]">
                <span
                  className={
                    s.done
                      ? "text-emerald-600"
                      : "text-slate-400"
                  }
                >
                  {s.done ? "✓" : "○"}
                </span>
                {s.done ? (
                  <span className="text-slate-500 line-through">{s.label}</span>
                ) : (
                  <Link
                    href={s.href}
                    className="text-indigo-700 underline-offset-2 hover:underline"
                  >
                    {s.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mb-6">
        <SectionLabel>Treasury</SectionLabel>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-slate-900">
                Organisation float
              </div>
              {org.treasuryAddress ? (
                <a
                  href={explorerAddress(org.treasuryAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono mt-1 inline-block text-[12px] text-indigo-600 hover:underline"
                  title={org.treasuryAddress}
                >
                  {shortAddress(org.treasuryAddress)} ↗
                </a>
              ) : (
                <div className="mt-1 text-[12px] text-amber-700">
                  Not provisioned
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                On-chain
              </div>
              <div className="tabular text-[22px] font-semibold text-slate-900">
                {treasuryBalance === null ? "—" : formatUsd(treasuryBalance)}
              </div>
              <div className="text-[11px] text-slate-400">USDC on Arc</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Departments" value={String(departments.length)} />
        <Stat label="Allocated" value={formatUsd(totalBudget)} />
        <Stat label="Members" value={String(counts._count.members)} />
        <Stat label="Accounts" value={String(accountCount)} />
      </div>

      {departments.length > 0 && (
        <section className="mt-6">
          <SectionLabel>Departments</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <tbody>
                {departments.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="mono text-[11px] text-slate-400">
                        {d.code}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.address ? (
                        <a
                          href={explorerAddress(d.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-[12px] text-indigo-600 hover:underline"
                        >
                          {shortAddress(d.address)} ↗
                        </a>
                      ) : (
                        <span className="text-[12px] text-amber-700">
                          No wallet
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular text-slate-900">
                        {formatUsd(d.budgetMinor)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="tabular mt-1 text-[18px] font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
