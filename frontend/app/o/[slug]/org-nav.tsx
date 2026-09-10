"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    group: "Buy",
    links: [
      { path: "requests", label: "Requests" },
      { path: "orders", label: "Purchase orders" },
      { path: "bills", label: "Bills" },
      { path: "payments", label: "Payments" },
    ],
  },
  {
    group: "Master data",
    links: [
      { path: "vendors", label: "Vendors" },
      { path: "items", label: "Items" },
      { path: "accounts", label: "Chart of accounts" },
    ],
  },
  {
    group: "Finance",
    links: [
      { path: "ledger", label: "Journal" },
      { path: "trial-balance", label: "Trial balance" },
    ],
  },
  {
    group: "Settings",
    links: [
      { path: "settings/people", label: "People & roles" },
      { path: "settings/departments", label: "Departments & budgets" },
      { path: "settings/outbox", label: "Outbox" },
    ],
  },
];

export function OrgNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/o/${slug}`;

  return (
    <nav className="space-y-5 px-3 py-4">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {section.group}
          </div>
          <ul className="space-y-0.5">
            {section.links.map((l) => {
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
      ))}
    </nav>
  );
}
