import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { formatUsd } from "@/lib/units";
import { explorerTx } from "@/lib/chain";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, { label: string; tone: string }> = {
  GOODS_RECEIPT: {
    label: "Goods received",
    tone: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  BILL: {
    label: "Bill",
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  },
  PAYMENT: {
    label: "Payment",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
};

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgManage(slug);

  const accounts = await db.account.findMany({
    where: { orgId: org.id },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const entries = await db.journalEntry.findMany({
    where: { lines: { some: { accountId: { in: accounts.map((a) => a.id) } } } },
    include: { lines: true },
    orderBy: { entryDate: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight">Journal</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Every entry the procurement cycle posts. Nothing here is edited or
          reversed — a ledger you can amend is one nobody can rely on, so
          corrections are posted as further entries.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            Nothing posted yet
          </div>
          <p className="mx-auto mt-1 max-w-lg text-[12px] leading-relaxed text-slate-500">
            Confirming goods received posts the first entry — Dr Expense, Cr
            GR/IR clearing. The liability exists from the moment goods
            arrive, not from the moment somebody invoices for them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const src = SOURCE[e.sourceType] ?? {
              label: e.sourceType,
              tone: "bg-slate-100 text-slate-600 ring-slate-500/20",
            };
            const dr = e.lines.reduce((s, l) => s + l.debitMinor, 0n);
            const cr = e.lines.reduce((s, l) => s + l.creditMinor, 0n);
            return (
              <div
                key={e.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${src.tone}`}
                    >
                      {src.label}
                    </span>
                    <span className="text-[12px] text-slate-700">{e.memo}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    {e.txHash && (
                      <a
                        href={explorerTx(e.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-indigo-700 hover:underline"
                      >
                        {e.txHash.slice(0, 12)}… ↗
                      </a>
                    )}
                    <span>{e.entryDate.toLocaleString("en-GB")}</span>
                  </div>
                </div>

                <table className="w-full text-[13px]">
                  <tbody>
                    {e.lines.map((l) => {
                      const a = byId.get(l.accountId);
                      const isDebit = l.debitMinor > 0n;
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="px-4 py-2">
                            <span className="mono text-[12px] text-slate-500">
                              {a?.code}
                            </span>
                            <span
                              className={
                                isDebit
                                  ? "ml-2 text-slate-900"
                                  : "ml-6 text-slate-900"
                              }
                            >
                              {a?.name}
                            </span>
                          </td>
                          <td className="tabular w-32 px-4 py-2 text-right text-slate-900">
                            {l.debitMinor > 0n ? formatUsd(l.debitMinor) : ""}
                          </td>
                          <td className="tabular w-32 px-4 py-2 text-right text-slate-900">
                            {l.creditMinor > 0n ? formatUsd(l.creditMinor) : ""}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 text-[12px] font-medium">
                      <td className="px-4 py-2 text-slate-500">
                        {dr === cr ? "Balanced" : "DOES NOT BALANCE"}
                      </td>
                      <td className="tabular px-4 py-2 text-right text-slate-700">
                        {formatUsd(dr)}
                      </td>
                      <td className="tabular px-4 py-2 text-right text-slate-700">
                        {formatUsd(cr)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
