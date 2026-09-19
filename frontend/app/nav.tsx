"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    group: "Buy",
    links: [
      { href: "/requests", label: "Requests" },
      { href: "/orders", label: "Purchase orders" },
      { href: "/bills", label: "Bills" },
      { href: "/payments", label: "Payments" },
    ],
  },
  {
    group: "Master data",
    links: [
      { href: "/vendors", label: "Vendors" },
      { href: "/items", label: "Items" },
      { href: "/accounts", label: "Chart of accounts" },
    ],
  },
  {
    group: "Finance",
    links: [
      { href: "/ledger", label: "Journal" },
      { href: "/trial-balance", label: "Trial balance" },
    ],
  },
  {
    group: "Settings",
    links: [
      { href: "/settings/wallets", label: "Wallets & budgets" },
      { href: "/settings/outbox", label: "Outbox" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-5 px-3 py-4">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {section.group}
          </div>
          <ul className="space-y-0.5">
            {section.links.map((l) => {
              // startsWith so a detail route (/orders/PO-0007) keeps its
              // parent section highlighted.
              const active =
                pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
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
