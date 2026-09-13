import { requireOrgManage } from "@/lib/org";
import { trialBalance } from "@/lib/ledger/post";
import { formatAmount } from "@/lib/units";

/**
 * GL export.
 *
 * Plain CSV with unformatted amounts, because the destination is a
 * spreadsheet or another accounting system, not a person. Thousands
 * separators would have to be stripped back out at the other end.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { org } = await requireOrgManage(slug);
  const tb = await trialBalance(org.id);

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ["Code", "Account", "Type", "Debit", "Credit", "Balance"].join(","),
    ...tb.rows.map((r) =>
      [
        esc(r.code),
        esc(r.name),
        esc(r.type),
        formatAmount(r.debitMinor).replace(/,/g, ""),
        formatAmount(r.creditMinor).replace(/,/g, ""),
        formatAmount(r.balanceMinor).replace(/,/g, ""),
      ].join(","),
    ),
    [
      esc("TOTAL"),
      esc(tb.balanced ? "Balanced" : "OUT OF BALANCE"),
      "",
      formatAmount(tb.totalDebit).replace(/,/g, ""),
      formatAmount(tb.totalCredit).replace(/,/g, ""),
      "",
    ].join(","),
  ].join("\n");

  return new Response(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-trial-balance.csv"`,
    },
  });
}
