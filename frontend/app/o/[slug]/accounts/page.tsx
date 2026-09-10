import { AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { AddAccount, ToggleAccount } from "./account-controls";

export const dynamic = "force-dynamic";

const GROUPS: { type: AccountType; label: string; note?: string }[] = [
  {
    type: AccountType.ASSET,
    label: "Assets",
    note: "One cash account per department wallet",
  },
  { type: AccountType.LIABILITY, label: "Liabilities" },
  { type: AccountType.EQUITY, label: "Equity" },
  { type: AccountType.INCOME, label: "Income" },
  {
    type: AccountType.EXPENSE,
    label: "Expenses",
    note: "Items post here automatically via their default account",
  },
];

/** Accounts the procure-to-pay cycle posts to. Worth flagging in the UI. */
const KEY_ACCOUNTS: Record<string, string> = {
  "2000": "Credited when a bill is recorded, debited when it is paid",
  "2100":
    "Holds the timing difference between goods received and invoice received — a non-zero balance here IS the match exception report",
};

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, canManage } = await requireOrgManage(slug);

  const accounts = await db.account.findMany({
    where: { orgId: org.id },
    orderBy: { code: "asc" },
  });

  const active = accounts.filter((a) => a.active).length;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Chart of accounts
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Every movement in the procure-to-pay cycle posts a balanced
            journal entry against these accounts.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {active}
          </div>
          <div className="text-[11px] text-slate-400">
            active{accounts.length !== active && ` of ${accounts.length}`}
          </div>
        </div>
      </header>

      {canManage && (
        <div className="mb-6">
          <AddAccount slug={slug} />
        </div>
      )}

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const rows = accounts.filter((a) => a.type === group.type);
          if (rows.length === 0) return null;
          return (
            <section key={group.type}>
              <div className="mb-2 flex items-baseline gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
                {group.note && (
                  <div className="text-[11px] text-slate-400">{group.note}</div>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-[13px]">
                  <tbody>
                    {rows.map((a) => {
                      const key = KEY_ACCOUNTS[a.code];
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="w-24 px-4 py-3 align-top">
                            <span className="mono tabular text-slate-500">
                              {a.code}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  a.active
                                    ? "font-medium text-slate-900"
                                    : "font-medium text-slate-400 line-through"
                                }
                              >
                                {a.name}
                              </span>
                              {a.subtype && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                  {a.subtype}
                                </span>
                              )}
                              {!a.active && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-500/20">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {key && (
                              <div className="mt-1 max-w-2xl text-[11px] text-slate-500">
                                {key}
                              </div>
                            )}
                          </td>
                          <td className="w-28 px-4 py-3 text-right align-top">
                            {canManage && (
                              <ToggleAccount
                                slug={slug}
                                id={a.id}
                                active={a.active}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          How the cycle posts
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="pb-1.5 font-medium">Event</th>
              <th className="pb-1.5 font-medium">Debit</th>
              <th className="pb-1.5 font-medium">Credit</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-t border-slate-100">
              <td className="py-1.5">PO issued</td>
              <td className="py-1.5 text-slate-400" colSpan={2}>
                No entry — encumbrance is a budgetary control, not a posting
              </td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1.5">Goods received</td>
              <td className="py-1.5">Expense (from item)</td>
              <td className="py-1.5">2100 GR/IR Clearing</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1.5">Bill recorded</td>
              <td className="py-1.5">2100 GR/IR Clearing</td>
              <td className="py-1.5">2000 Accounts Payable</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1.5">Payment settled</td>
              <td className="py-1.5">2000 Accounts Payable</td>
              <td className="py-1.5">Cash — USDC (department)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
