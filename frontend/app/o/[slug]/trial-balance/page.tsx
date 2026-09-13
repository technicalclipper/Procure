import { requireOrgManage } from "@/lib/org";
import { trialBalance } from "@/lib/ledger/post";
import { formatUsd } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgManage(slug);
  const tb = await trialBalance(org.id);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Trial balance
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Every account with movement, and whether the books add up.
          </p>
        </div>
        <a
          href={`/o/${slug}/trial-balance/export`}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </header>

      {/* GR/IR is the headline, not a row buried in a table */}
      <div
        className={`mb-5 rounded-lg border p-4 ${
          tb.grirMinor === 0n
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-amber-300 bg-amber-50/60"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div
            className={`text-[13px] font-medium ${
              tb.grirMinor === 0n ? "text-emerald-900" : "text-amber-900"
            }`}
          >
            GR/IR clearing
          </div>
          <div
            className={`tabular text-[19px] font-semibold ${
              tb.grirMinor === 0n ? "text-emerald-700" : "text-amber-800"
            }`}
          >
            {formatUsd(tb.grirMinor < 0n ? -tb.grirMinor : tb.grirMinor)}
          </div>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
          {tb.grirMinor === 0n
            ? "Zero — everything received has been invoiced and everything invoiced was received. Nothing outstanding between the two."
            : "This is the gap between what has been received and what has been invoiced. It clears to zero only when the two agree, which makes it the match exception report — not a screen anyone has to remember to open, but a number that will not go away until somebody resolves it."}
        </p>
      </div>

      {!tb.balanced && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          Debits and credits disagree by{" "}
          {formatUsd(
            tb.totalDebit > tb.totalCredit
              ? tb.totalDebit - tb.totalCredit
              : tb.totalCredit - tb.totalDebit,
          )}
          . Something wrote an unbalanced entry — this is a bug, not a
          bookkeeping matter.
        </div>
      )}

      {tb.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No movement yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            Accounts appear here once the procurement cycle posts to them.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Code</Th>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th align="right">Debit</Th>
                <Th align="right">Credit</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr
                  key={r.code}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="mono px-4 py-2.5 text-slate-500">{r.code}</td>
                  <td className="px-4 py-2.5 text-slate-900">{r.name}</td>
                  <td className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-400">
                    {r.type.toLowerCase()}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-slate-700">
                    {r.debitMinor > 0n ? formatUsd(r.debitMinor) : "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-slate-700">
                    {r.creditMinor > 0n ? formatUsd(r.creditMinor) : "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium text-slate-900">
                    {formatUsd(
                      r.balanceMinor < 0n ? -r.balanceMinor : r.balanceMinor,
                    )}
                    {r.balanceMinor < 0n && (
                      <span className="ml-1 text-[11px] text-amber-700">cr</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-medium">
                <td className="px-4 py-2.5 text-slate-500" colSpan={3}>
                  {tb.balanced ? "Balanced" : "Out of balance"}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-900">
                  {formatUsd(tb.totalDebit)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-900">
                  {formatUsd(tb.totalCredit)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
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
