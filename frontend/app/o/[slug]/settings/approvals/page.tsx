import { ApprovalModule } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { formatAmount, formatUsd } from "@/lib/units";
import { describeLevelRule, ensureFlow, getFlow } from "@/lib/procurement/approval-flow";
import { FlowEditor } from "./flow-editor";

export const dynamic = "force-dynamic";

const MODULES: {
  module: ApprovalModule;
  title: string;
  description: string;
}[] = [
  {
    module: ApprovalModule.PURCHASE_REQUEST,
    title: "Purchase requests",
    description:
      "Who signs off before a request becomes a purchase order. This is the main approval point in the cycle.",
  },
  {
    module: ApprovalModule.BILL,
    title: "Bills",
    description:
      "Normally left off: a bill is settled by the three-way match, not by a person. Turn it on if you want a human to approve variances.",
  },
];

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireOrgManage(slug);

  // Make sure both rows exist so the page has something to edit.
  await Promise.all(MODULES.map((m) => ensureFlow(org.id, m.module)));

  const [flows, members] = await Promise.all([
    Promise.all(MODULES.map((m) => getFlow(org.id, m.module))),
    db.orgMember.findMany({
      where: { orgId: org.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const memberOptions = members.map((m) => ({
    id: m.userId,
    label: m.user.name ?? m.user.email,
  }));

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight">
          Approval flows
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-slate-500">
          Configured per module. Levels apply in order, and only those whose
          threshold the amount meets are used — so a $500 request and a
          $50,000 one can take different paths through the same ladder.
        </p>
      </header>

      <div className="space-y-5">
        {MODULES.map((m, i) => {
          const flow = flows[i];
          return (
            <FlowEditor
              key={m.module}
              slug={slug}
              module={m.module}
              title={m.title}
              description={m.description}
              enabled={flow?.enabled ?? false}
              members={memberOptions}
              levels={(flow?.levels ?? []).map((l) => ({
                id: l.id,
                position: l.position,
                name: l.name,
                minAmount: formatAmount(l.minAmountMinor),
                mode: l.mode,
                quorumCount: l.quorumCount,
                approverIds: l.approvers.map((a) => a.userId),
                rule: describeLevelRule({
                  mode: l.mode,
                  quorumCount: l.quorumCount,
                  approverCount: l.approvers.length,
                  minAmountMinor: l.minAmountMinor,
                }),
              }))}
            />
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[12px] font-medium text-slate-900">
          How a request finds its path
        </div>
        <ol className="space-y-1 text-[12px] text-slate-600">
          <li>
            1. If the module has approval turned off, the request is approved
            the moment it&apos;s submitted.
          </li>
          <li>
            2. Otherwise every level whose threshold the amount meets applies,
            in order.
          </li>
          <li>
            3. Signatures are collected at the current level until its rule is
            satisfied, then it moves to the next.
          </li>
          <li>
            4. The applicable levels are frozen onto the request at submit —
            editing this page later never moves the bar under something
            already in flight.
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">
          Example: a level at {formatUsd(0n)} with &ldquo;any one&rdquo; plus a
          level at $10,000 with &ldquo;2 of 3&rdquo; means small requests need
          a single signature and large ones need three in total.
        </p>
      </div>
    </div>
  );
}
