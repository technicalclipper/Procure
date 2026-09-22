import Link from "next/link";
import { requireOrgAccess } from "@/lib/org";
import { SignOutButton } from "@/app/auth-buttons";
import { OrgNav } from "./org-nav";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, orgRole } = await requireOrgAccess(slug);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <Link href={`/o/${org.slug}`} className="block">
            <div className="text-[15px] font-semibold tracking-tight">
              {org.name}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {titleCase(orgRole)}
            </div>
          </Link>
        </div>

        <OrgNav slug={org.slug} />

        <div className="mt-auto border-t border-slate-200 px-5 py-3">
          <Link
            href="/"
            className="block text-[11px] text-slate-500 hover:text-slate-900"
          >
            ← All organisations
          </Link>
          <div className="mt-2 truncate text-[11px] text-slate-400" title={user.email}>
            {user.email}
          </div>
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
