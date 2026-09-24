import {
  requireOrgAccess,
  getUserOrgs,
  getOrgCapabilities,
} from "@/lib/org";
import { SignOutButton } from "@/app/auth-buttons";
import { OrgNav } from "./org-nav";
import { OrgSwitcher } from "./org-switcher";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, orgRole, canManage } = await requireOrgAccess(slug);
  const [orgs, caps] = await Promise.all([
    getUserOrgs(user.id),
    getOrgCapabilities(user.id, org.id),
  ]);

  const roleSummary = [
    canManage ? titleCase(orgRole) : null,
    caps.isApprover ? "Approver" : null,
    caps.isPurchaser ? "Purchaser" : null,
    caps.isRequester ? "Requester" : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-4">
          <OrgSwitcher
            current={{ slug: org.slug, name: org.name, orgRole }}
            orgs={orgs.map((o) => ({
              slug: o.slug,
              name: o.name,
              orgRole: o.orgRole,
            }))}
          />
        </div>

        <OrgNav
          slug={org.slug}
          caps={{
            isAdmin: canManage,
            isRequester: caps.isRequester,
            isPurchaser: caps.isPurchaser,
            isApprover: caps.isApprover,
          }}
        />

        <div className="mt-auto border-t border-slate-200 px-5 py-3">
          <div className="truncate text-[11px] text-slate-400" title={user.email}>
            {user.email}
          </div>
          {roleSummary.length > 0 && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              {roleSummary.join(" · ")}
            </div>
          )}
          <div className="mt-1">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
