import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { explorerAddress, shortAddress } from "@/lib/chain";
import {
  InviteUser,
  AddRole,
  RemoveRole,
  ProvisionUserWallet,
} from "./people-controls";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<Role, string> = {
  CONTROLLER: "bg-violet-50 text-violet-700 ring-violet-600/20",
  APPROVER: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REQUESTER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default async function PeoplePage() {
  const org = await db.organization.findFirst();
  if (!org) {
    return (
      <Shell>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
          No organisation found. Run `npm run db:seed`.
        </div>
      </Shell>
    );
  }

  const [users, departments] = await Promise.all([
    db.user.findMany({
      where: { orgId: org.id },
      include: {
        memberships: { include: { department: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({
      where: { orgId: org.id },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  // A department with fewer than two approvers can never reach a 2-of-3
  // quorum, which strands every request raised there.
  const approverCount = new Map<string, number>();
  for (const u of users) {
    for (const m of u.memberships) {
      if (m.role === Role.APPROVER) {
        approverCount.set(
          m.departmentId,
          (approverCount.get(m.departmentId) ?? 0) + 1,
        );
      }
    }
  }
  const thin = departments.filter((d) => (approverCount.get(d.id) ?? 0) < 2);
  const noWallet = users.filter((u) => !u.walletId).length;

  return (
    <Shell>
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            People &amp; roles
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Roles are held per department — the same person can raise requests
            in one and approve for another.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {users.length}
          </div>
          <div className="text-[11px] text-slate-400">members</div>
        </div>
      </header>

      {thin.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <span className="font-medium">
            {thin.map((d) => d.name).join(", ")}
          </span>{" "}
          {thin.length === 1 ? "has" : "have"} fewer than two approvers — a
          request over the quorum threshold could never be approved there.
        </div>
      )}

      {noWallet > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {noWallet} member{noWallet === 1 ? "" : "s"} without a wallet. An
          approval is a signature, so they cannot sign off until provisioned.
        </div>
      )}

      <div className="mb-6">
        <InviteUser departments={departments} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Member</Th>
              <Th>Roles</Th>
              <Th>Signing wallet</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-900">{u.name}</div>
                  <div className="text-[11px] text-slate-500">{u.email}</div>
                </td>

                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.memberships.length === 0 && (
                      <span className="text-[12px] text-slate-400">
                        No roles
                      </span>
                    )}
                    {u.memberships
                      .slice()
                      .sort(
                        (a, b) =>
                          a.role.localeCompare(b.role) ||
                          a.department.code.localeCompare(b.department.code),
                      )
                      .map((m) => (
                        <span
                          key={m.id}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ROLE_TONE[m.role]}`}
                        >
                          {titleCase(m.role)}
                          <span className="mono ml-1 opacity-70">
                            {m.department.code}
                          </span>
                          <RemoveRole membershipId={m.id} />
                        </span>
                      ))}
                    <AddRole userId={u.id} departments={departments} />
                  </div>
                </td>

                <td className="w-56 px-4 py-3 align-top">
                  {u.address ? (
                    <a
                      href={explorerAddress(u.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[12px] text-indigo-600 hover:underline"
                      title={u.address}
                    >
                      {shortAddress(u.address)} ↗
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-amber-700">None</span>
                      <ProvisionUserWallet userId={u.id} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          What each role can do
        </div>
        <table className="w-full text-[12px]">
          <tbody className="text-slate-600">
            <tr className="border-t border-slate-100">
              <td className="w-28 py-1.5 font-medium text-slate-900">
                Requester
              </td>
              <td className="py-1.5">
                Raises purchase requests and confirms goods receipt for their
                department
              </td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-900">Approver</td>
              <td className="py-1.5">
                Signs off on requests. Counts toward the 2-of-3 quorum on
                anything over the threshold.
              </td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-900">Controller</td>
              <td className="py-1.5">
                Org-wide. Manages masters, budgets, vendor onboarding and the
                payment allowlist.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>;
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

function titleCase(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
