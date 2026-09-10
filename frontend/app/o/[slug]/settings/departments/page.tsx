import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { usdcBalances, explorerAddress, shortAddress } from "@/lib/chain";
import { formatUsd, formatAmount } from "@/lib/units";
import {
  AddDepartment,
  EditBudget,
  ProvisionDepartmentWallet,
  ProvisionTreasury,
} from "./department-controls";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, canManage } = await requireOrgAccess(slug);

  const departments = await db.department.findMany({
    where: { orgId: org.id },
    orderBy: { code: "asc" },
  });

  const balances = await usdcBalances([
    org.treasuryAddress,
    ...departments.map((d) => d.address),
  ]);

  const totalBudget = departments.reduce((s, d) => s + d.budgetMinor, 0n);
  const totalOnChain = departments.reduce(
    (s, d) => s + (d.address ? (balances[d.address] ?? 0n) : 0n),
    0n,
  );
  const missingWallets = departments.filter((d) => !d.walletId).length;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-7">
        <h1 className="text-[19px] font-semibold tracking-tight">
          Departments &amp; budgets
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Each department holds its own Privy server wallet. Fund it to
          exactly its budget and the balance itself becomes the ceiling.
        </p>
      </header>

      {/*
        Honest about what is actually enforced today. The budget becomes a
        hard on-chain cap once the registry is deployed and each department
        approves it for exactly the budget amount — the ERC-20 allowance
        then caps cumulative spend regardless of what our code does.
      */}
      <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        <span className="font-medium text-slate-900">
          Budgets are pre-check limits today.
        </span>{" "}
        They become a hard on-chain ceiling when the payment registry is
        deployed: each department will approve it for exactly its budget, so
        the USDC contract caps cumulative spend on its own.
      </div>

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
              ) : canManage ? (
                <div className="mt-2">
                  <ProvisionTreasury slug={slug} />
                </div>
              ) : (
                <div className="mt-1 text-[12px] text-amber-700">
                  Not provisioned
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
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

      {missingWallets > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {missingWallets} department{missingWallets === 1 ? "" : "s"} without
          a wallet — they cannot be paid from until provisioned.
        </div>
      )}

      <section>
        <SectionLabel>Departments</SectionLabel>

        {departments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-[13px] font-medium text-slate-900">
              No departments yet
            </div>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500">
              A department is where spend is budgeted and approved. Each gets
              its own wallet and cash account.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <Th>Department</Th>
                  <Th>Wallet</Th>
                  <Th>Cash a/c</Th>
                  <Th align="right">Budget</Th>
                  <Th align="right">On-chain</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const bal = d.address ? (balances[d.address] ?? null) : null;
                  const funded = bal !== null && bal >= d.budgetMinor;
                  const partial = bal !== null && bal > 0n && !funded;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <Td>
                        <div className="font-medium text-slate-900">
                          {d.name}
                        </div>
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
                        ) : canManage ? (
                          <ProvisionDepartmentWallet slug={slug} id={d.id} />
                        ) : (
                          <span className="text-[12px] text-amber-700">
                            None
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="mono text-[12px] text-slate-500">
                          {d.cashAccountCode ?? "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <div className="tabular text-slate-900">
                          {formatUsd(d.budgetMinor)}
                        </div>
                        {canManage && (
                          <div className="mt-0.5">
                            <EditBudget
                              slug={slug}
                              id={d.id}
                              current={formatAmount(d.budgetMinor)}
                            />
                          </div>
                        )}
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
                  <Td colSpan={3}>
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
        )}

        {canManage && (
          <div className="mt-3">
            <AddDepartment slug={slug} />
          </div>
        )}

        {departments.length > 0 && totalOnChain === 0n && (
          <p className="mt-3 text-[12px] text-slate-500">
            Wallets exist but hold no USDC. Fund them from the Circle faucet
            on Arc testnet — balances read live from{" "}
            <span className="mono">0x3600…0000</span>.
          </p>
        )}
      </section>
    </div>
  );
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
      className={`px-4 py-3 align-top ${align === "right" ? "text-right" : "text-left"}`}
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
