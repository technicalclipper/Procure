import { db } from "@/lib/db";
import { usdcBalances, explorerAddress, shortAddress } from "@/lib/chain";
import { formatUsd } from "@/lib/units";
import { ProvisionButton } from "./provision-button";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const org = await db.organization.findFirst({
    include: { departments: { orderBy: { code: "asc" } } },
  });

  if (!org) {
    return (
      <Shell>
        <Empty>No organisation found. Run `npm run db:seed`.</Empty>
      </Shell>
    );
  }

  const addresses = [
    org.treasuryAddress,
    ...org.departments.map((d) => d.address),
  ];
  const balances = await usdcBalances(addresses);

  const missing =
    (org.treasuryWalletId ? 0 : 1) +
    org.departments.filter((d) => !d.walletId).length;

  const totalBudget = org.departments.reduce(
    (sum, d) => sum + d.budgetMinor,
    0n,
  );
  const totalOnChain = org.departments.reduce(
    (sum, d) => sum + (d.address ? (balances[d.address] ?? 0n) : 0n),
    0n,
  );

  return (
    <Shell>
      <header className="mb-7">
        <h1 className="text-[19px] font-semibold tracking-tight">
          Wallets &amp; budgets
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Each department holds its own Privy server wallet, pre-funded to
          exactly its budget — so it physically cannot overspend.
        </p>
      </header>

      {missing > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-[13px] font-medium text-amber-900">
            {missing} wallet{missing === 1 ? "" : "s"} not yet provisioned
          </div>
          <p className="mt-1 mb-3 text-[12px] text-amber-800">
            Creates Privy server wallets and stores their IDs in the database.
            Safe to re-run — it only creates what&apos;s missing.
          </p>
          <ProvisionButton missing={missing} />
        </div>
      )}

      {/* Treasury */}
      <section className="mb-6">
        <SectionLabel>Treasury</SectionLabel>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-slate-900">
                {org.name}
              </div>
              {org.treasuryAddress ? (
                <a
                  href={explorerAddress(org.treasuryAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono mt-1 inline-block text-[12px] text-indigo-600 hover:underline"
                  title={org.treasuryAddress}
                >
                  {shortAddress(org.treasuryAddress)} ↗
                </a>
              ) : (
                <div className="mt-1 text-[12px] text-slate-400">
                  Not provisioned
                </div>
              )}
              {org.treasuryWalletId && (
                <div className="mono mt-1.5 text-[10px] text-slate-400">
                  privy:{org.treasuryWalletId}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                On-chain
              </div>
              <div className="tabular text-[22px] font-semibold text-slate-900">
                {org.treasuryAddress
                  ? formatUsd(balances[org.treasuryAddress] ?? 0n)
                  : "—"}
              </div>
              <div className="text-[11px] text-slate-400">USDC on Arc</div>
            </div>
          </div>
        </div>
      </section>

      {/* Departments */}
      <section>
        <SectionLabel>Departments</SectionLabel>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <Th>Department</Th>
                <Th>Wallet</Th>
                <Th align="right">Budget</Th>
                <Th align="right">On-chain</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {org.departments.map((d) => {
                const bal = d.address ? (balances[d.address] ?? null) : null;
                const funded = bal !== null && bal >= d.budgetMinor;
                const partial = bal !== null && bal > 0n && !funded;
                return (
                  <tr
                    key={d.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <Td>
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="mono text-[11px] text-slate-400">
                        {d.code}
                      </div>
                    </Td>
                    <Td>
                      {d.address ? (
                        <a
                          href={explorerAddress(d.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-[12px] text-indigo-600 hover:underline"
                          title={d.address}
                        >
                          {shortAddress(d.address)} ↗
                        </a>
                      ) : (
                        <span className="text-[12px] text-slate-400">
                          Not provisioned
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="tabular text-slate-900">
                        {formatUsd(d.budgetMinor)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-slate-900">
                        {bal === null ? "—" : formatUsd(bal)}
                      </span>
                    </Td>
                    <Td align="right">
                      {!d.address ? (
                        <Pill tone="slate">Pending</Pill>
                      ) : funded ? (
                        <Pill tone="ok">Funded</Pill>
                      ) : partial ? (
                        <Pill tone="warn">Partial</Pill>
                      ) : (
                        <Pill tone="warn">Unfunded</Pill>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-medium">
                <Td colSpan={2}>
                  <span className="text-slate-500">Total</span>
                </Td>
                <Td align="right">
                  <span className="tabular">{formatUsd(totalBudget)}</span>
                </Td>
                <Td align="right">
                  <span className="tabular">{formatUsd(totalOnChain)}</span>
                </Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        </div>

        {totalOnChain === 0n && missing === 0 && (
          <p className="mt-3 text-[12px] text-slate-500">
            Wallets exist but hold no USDC. Fund them from the Circle faucet on
            Arc testnet — balances here read live from{" "}
            <span className="mono">0x3600…0000</span>.
          </p>
        )}
      </section>
    </Shell>
  );
}

/* ── bits ─────────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
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

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "bad" | "slate";
}) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
    bad: "bg-red-50 text-red-700 ring-red-600/20",
    slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones}`}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
      {children}
    </div>
  );
}
