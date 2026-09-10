"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavCaps = {
  isAdmin: boolean;
  isApprover: boolean;
};

/**
 * `visible` decides who sees a link. This is presentation only — the
 * matching pages enforce the same rule server-side via requireOrgManage,
 * because anyone can type a URL.
 */
type Visible = "all" | "approver" | "admin";

const NAV: {
  group: string;
  links: { path: string; label: string; visible: Visible }[];
}[] = [
  {
    group: "Buy",
    links: [
      { path: "requests", label: "Requests", visible: "all" },
      { path: "approvals", label: "Approvals", visible: "approver" },
      { path: "orders", label: "Purchase orders", visible: "all" },
      { path: "bills", label: "Bills", visible: "admin" },
      { path: "payments", label: "Payments", visible: "admin" },
    ],
  },
  {
    group: "Master data",
    links: [
      { path: "vendors", label: "Vendors", visible: "all" },
      { path: "items", label: "Items", visible: "all" },
      { path: "accounts", label: "Chart of accounts", visible: "admin" },
    ],
  },
  {
    group: "Finance",
    links: [
      { path: "ledger", label: "Journal", visible: "admin" },
      { path: "trial-balance", label: "Trial balance", visible: "admin" },
    ],
  },
  {
    group: "Settings",
    links: [
      { path: "settings/people", label: "People & roles", visible: "admin" },
      {
        path: "settings/departments",
        label: "Departments & budgets",
        visible: "admin",
      },
      { path: "settings/outbox", label: "Outbox", visible: "admin" },
    ],
  },
];

function canSee(v: Visible, caps: NavCaps) {
  if (caps.isAdmin) return true;
  if (v === "all") return true;
  if (v === "approver") return caps.isApprover;
  return false;
}

export function OrgNav({ slug, caps }: { slug: string; caps: NavCaps }) {
  const pathname = usePathname();
  const base = `/o/${slug}`;

  return (
    <nav className="space-y-5 px-3 py-4">
      {NAV.map((section) => {
        const links = section.links.filter((l) => canSee(l.visible, caps));
        if (links.length === 0) return null;
        return (
          <div key={section.group}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {section.group}
            </div>
            <ul className="space-y-0.5">
              {links.map((l) => {
                const href = `${base}/${l.path}`;
                // startsWith so a detail route keeps its section highlighted
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={l.path}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "block rounded-md bg-indigo-50 px-2 py-1.5 text-[13px] font-medium text-indigo-700"
                          : "block rounded-md px-2 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      }
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
