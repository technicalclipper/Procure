import { InvitationStatus, OrgRole, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { InviteForm, RevokeInvitation } from "./invite-form";

export const dynamic = "force-dynamic";

const ORG_TONE: Record<OrgRole, string> = {
  OWNER: "bg-violet-50 text-violet-700 ring-violet-600/20",
  CONTROLLER: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  MEMBER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const DEPT_TONE: Record<Role, string> = {
  APPROVER: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REQUESTER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, canManage } = await requireOrgManage(slug);

  const [members, departments, invitations] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId: org.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    }),
    db.department.findMany({
      where: { orgId: org.id },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.invitation.findMany({
      where: { orgId: org.id, status: InvitationStatus.PENDING },
      include: { department: true, invitedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const deptMemberships = await db.membership.findMany({
    where: { department: { orgId: org.id } },
    include: { department: true },
  });
  const byUser = new Map<string, typeof deptMemberships>();
  for (const m of deptMemberships) {
    const list = byUser.get(m.userId) ?? [];
    list.push(m);
    byUser.set(m.userId, list);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            People &amp; roles
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Organisation standing plus department-scoped roles — the same
            person can raise requests in one department and approve for
            another.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {members.length}
          </div>
          <div className="text-[11px] text-slate-400">
            member{members.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>

      {canManage && departments.length === 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          No departments yet — you can still invite people, but they
          won&apos;t have a department role until one exists.
        </div>
      )}

      {canManage && (
        <div className="mb-6">
          <InviteForm
            slug={slug}
            orgName={org.name}
            inviterName={user.name ?? user.email}
            inviterEmail={user.email}
            departments={departments}
          />
        </div>
      )}

      {invitations.length > 0 && (
        <section className="mb-6">
          <SectionLabel>Pending invitations</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <tbody>
                {invitations.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {inv.email}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        invited by {inv.invitedBy.name ?? inv.invitedBy.email} ·
                        expires {inv.expiresAt.toLocaleDateString("en-GB")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Pill tone={ORG_TONE[inv.orgRole]}>
                          {titleCase(inv.orgRole)}
                        </Pill>
                        {inv.role && inv.department && (
                          <Pill tone={DEPT_TONE[inv.role]}>
                            {titleCase(inv.role)}
                            <span className="mono ml-1 opacity-70">
                              {inv.department.code}
                            </span>
                          </Pill>
                        )}
                      </div>
                    </td>
                    <td className="w-24 px-4 py-3 text-right">
                      {canManage && <RevokeInvitation slug={slug} id={inv.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <SectionLabel>Members</SectionLabel>
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
              {members.map((m) => {
                const depts = byUser.get(m.userId) ?? [];
                return (
                  <tr
                    key={m.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900">
                        {m.user.name ?? m.user.email}
                        {m.userId === user.id && (
                          <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {m.user.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <Pill tone={ORG_TONE[m.orgRole]}>
                          {titleCase(m.orgRole)}
                        </Pill>
                        {depts.map((d) => (
                          <Pill key={d.id} tone={DEPT_TONE[d.role]}>
                            {titleCase(d.role)}
                            <span className="mono ml-1 opacity-70">
                              {d.department.code}
                            </span>
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td className="w-56 px-4 py-3 align-top">
                      {m.user.walletAddress ? (
                        <a
                          href={explorerAddress(m.user.walletAddress)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-[12px] text-indigo-600 hover:underline"
                          title={m.user.walletAddress}
                        >
                          {shortAddress(m.user.walletAddress)} ↗
                        </a>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
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

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
