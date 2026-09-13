import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { orgKey, readRegistry, registryAddress } from "@/lib/registry";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/chain";
import { AutoSettleToggle, RetrySync } from "./controls";

export const dynamic = "force-dynamic";

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgManage(slug);

  const [settings, runs] = await Promise.all([
    db.organization.findUnique({
      where: { id: org.id },
      select: { autoSettle: true },
    }),
    db.automationRun.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const registry = registryAddress();
  const threshold = registry
    ? Number(
        await readRegistry<number>("threshold", [orgKey(org.id), 1]).catch(
          () => 0,
        ),
      )
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight">Automation</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          What this organisation does without being asked.
        </p>
      </header>

      <div className="space-y-4">
        <AutoSettleToggle
          slug={slug}
          enabled={settings?.autoSettle ?? false}
          thresholdOnChain={threshold}
        />
        <RetrySync slug={slug} />
      </div>

      {registry && (
        <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
          Enforced by{" "}
          <a
            href={explorerAddress(registry)}
            target="_blank"
            rel="noreferrer"
            className="mono text-indigo-700 hover:underline"
          >
            {shortAddress(registry)} ↗
          </a>{" "}
          — nothing here can release a payment the contract would refuse.
        </div>
      )}

      <h2 className="mt-8 mb-2 text-[13px] font-medium text-slate-900">
        What it has done
      </h2>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-[12px] text-slate-500">
          Nothing yet. Every automated action is recorded here, successes
          and failures alike — an automation you can&apos;t audit is one
          nobody will trust with money.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Action</Th>
                <Th>What happened</Th>
                <Th>Transaction</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        r.succeeded
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-amber-50 text-amber-800 ring-amber-600/20"
                      }`}
                    >
                      {r.kind === "AUTO_SETTLE"
                        ? "Settle on match"
                        : r.kind === "SYNC_RETRY"
                          ? "Re-push"
                          : r.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] leading-relaxed text-slate-700">
                    {r.detail}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.txHash ? (
                      <a
                        href={explorerTx(r.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-[12px] text-indigo-700 hover:underline"
                      >
                        {r.txHash.slice(0, 12)}… ↗
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">
                    {r.createdAt.toLocaleString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}
