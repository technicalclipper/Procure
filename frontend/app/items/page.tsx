import Link from "next/link";
import { AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatUsd } from "@/lib/units";
import { AddItem, ToggleItem } from "./item-controls";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
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

  const [items, accounts] = await Promise.all([
    db.item.findMany({
      where: { orgId: org.id },
      include: { expenseAccount: true },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    db.account.findMany({
      where: { orgId: org.id, type: AccountType.EXPENSE, active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const uncoded = items.filter((i) => i.active && !i.expenseAccountCode).length;

  // Group by category, uncategorised last
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category ?? "Uncategorised";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b),
  );

  return (
    <Shell>
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Items</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Purchase request lines reference items. Each item&apos;s default
            expense account is what codes the line to the general ledger, so a
            requester never has to pick an account.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {items.filter((i) => i.active).length}
          </div>
          <div className="text-[11px] text-slate-400">active</div>
        </div>
      </header>

      {accounts.length === 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          No active expense accounts yet — add one in the{" "}
          <Link href="/accounts" className="underline">
            chart of accounts
          </Link>{" "}
          first, otherwise items can&apos;t self-code.
        </div>
      )}

      {uncoded > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {uncoded} active item{uncoded === 1 ? "" : "s"} without a default
          expense account. Requests using them will need manual GL coding.
        </div>
      )}

      <div className="mb-6">
        <AddItem accounts={accounts} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
          No items yet.
        </div>
      ) : (
        <div className="space-y-6">
          {ordered.map(([category, rows]) => (
            <section key={category}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {category}
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <Th>Code</Th>
                      <Th>Item</Th>
                      <Th>Unit</Th>
                      <Th>Codes to</Th>
                      <Th align="right">Default rate</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="w-28 px-4 py-3 align-top">
                          <span className="mono text-slate-500">
                            {item.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div
                            className={
                              item.active
                                ? "font-medium text-slate-900"
                                : "font-medium text-slate-400 line-through"
                            }
                          >
                            {item.name}
                          </div>
                          {item.description && (
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {item.description}
                            </div>
                          )}
                          {!item.active && (
                            <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-500/20">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="w-24 px-4 py-3 align-top text-slate-500">
                          {item.unit}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {item.expenseAccount ? (
                            <span className="text-slate-600">
                              <span className="mono text-slate-500">
                                {item.expenseAccount.code}
                              </span>{" "}
                              {item.expenseAccount.name}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                              Manual coding
                            </span>
                          )}
                        </td>
                        <td className="w-32 px-4 py-3 text-right align-top">
                          <span className="tabular text-slate-900">
                            {formatUsd(item.defaultRateMinor)}
                          </span>
                        </td>
                        <td className="w-28 px-4 py-3 text-right align-top">
                          <ToggleItem id={item.id} active={item.active} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>;
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
