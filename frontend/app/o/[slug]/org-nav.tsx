"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavCaps = {
  isAdmin: boolean;
  isRequester: boolean;
  isPurchaser: boolean;
  isApprover: boolean;
};

/**
 * Who sees a link. Presentation only — the matching pages enforce the
 * same rule server-side, because anyone can type a URL.
 *
 * "all" means any member of the org, including someone with no department
 * role yet.
 */
type Visible = "all" | "requester" | "purchaser" | "approver" | "admin";

const NAV: {
  group: string;
  links: { path: string; label: string; visible: Visible[] }[];
}[] = [
  {
    group: "Buy",
    links: [
      // A purchaser needs to see requests to turn approved ones into POs.
      { path: "requests", label: "Requests", visible: ["requester", "purchaser", "approver"] },
      { path: "approvals", label: "Approvals", visible: ["approver"] },
      { path: "orders", label: "Purchase orders", visible: ["purchaser", "requester"] },
      // Confirming receipt is the requester's job, so they need the list
      // of what's outstanding. A purchaser sees it read-only.
      { path: "receipts", label: "Goods receipts", visible: ["requester", "purchaser"] },
      { path: "bills", label: "Bills", visible: ["purchaser"] },
      // Read-only for a purchaser: they field "has my invoice been paid?".
      // Segregation of duties applies to releasing funds, not to seeing
      // the record — and nothing releases manually anyway, the match does.
      { path: "payments", label: "Payments", visible: ["purchaser"] },
    ],
  },
  {
    group: "Master data",
    links: [
      { path: "vendors", label: "Vendors", visible: ["purchaser", "requester", "approver"] },
      { path: "items", label: "Items", visible: ["purchaser", "requester", "approver"] },
      { path: "accounts", label: "Chart of accounts", visible: ["admin"] },
    ],
  },
  {
    group: "Finance",
    links: [
      { path: "ledger", label: "Journal", visible: ["admin"] },
      { path: "trial-balance", label: "Trial balance", visible: ["admin"] },
    ],
  },
  {
    group: "Settings",
    links: [
      { path: "settings/people", label: "People & roles", visible: ["admin"] },
      { path: "settings/approvals", label: "Approval flows", visible: ["admin"] },
      {
        path: "settings/departments",
        label: "Departments & budgets",
        visible: ["admin"],
      },
      { path: "settings/outbox", label: "Outbox", visible: ["admin"] },
    ],
  },
];

function canSee(visible: Visible[], caps: NavCaps) {
  if (caps.isAdmin) return true;
  return visible.some(
    (v) =>
      v === "all" ||
      (v === "requester" && caps.isRequester) ||
      (v === "purchaser" && caps.isPurchaser) ||
      (v === "approver" && caps.isApprover),
  );
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
