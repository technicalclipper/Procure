"use server";

import { revalidatePath } from "next/cache";
import { ApprovalMode, ApprovalModule } from "@prisma/client";
import { db } from "@/lib/db";
import { syncApprovers } from "@/lib/procurement/onchain";
import { requireOrgManage } from "@/lib/org";
import { parseUsd } from "@/lib/units";
import { ensureFlow } from "@/lib/procurement/approval-flow";

export type FlowActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

function asModule(v: string): ApprovalModule | null {
  return (Object.values(ApprovalModule) as string[]).includes(v)
    ? (v as ApprovalModule)
    : null;
}

export async function setFlowEnabledAction(
  slug: string,
  moduleRaw: string,
  enabled: boolean,
): Promise<FlowActionState> {
  try {
    const { org } = await requireOrgManage(slug);
    const module = asModule(moduleRaw);
    if (!module) return { ok: false, error: "Unknown module." };

    await ensureFlow(org.id, module);
    await db.approvalFlow.update({
      where: { orgId_module: { orgId: org.id, module } },
      data: { enabled },
    });

    revalidatePath(`/o/${slug}/settings/approvals`);
    return {
      ok: true,
      message: enabled
        ? "Approval required for this module."
        : "Approval turned off — requests are approved automatically.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addLevelAction(
  slug: string,
  moduleRaw: string,
  formData: FormData,
): Promise<FlowActionState> {
  try {
    const { org } = await requireOrgManage(slug);
    const module = asModule(moduleRaw);
    if (!module) return { ok: false, error: "Unknown module." };

    const name = String(formData.get("name") ?? "").trim() || null;
    const mode = String(formData.get("mode") ?? "ANY_ONE");
    const quorumCount = Math.max(1, Number(formData.get("quorumCount") ?? 1));
    const minRaw = String(formData.get("minAmount") ?? "0").trim();

    if (!(Object.values(ApprovalMode) as string[]).includes(mode)) {
      return { ok: false, error: "Pick a rule." };
    }

    let minAmountMinor: bigint;
    try {
      minAmountMinor = parseUsd(minRaw || "0");
    } catch {
      return { ok: false, error: `"${minRaw}" is not a valid amount.` };
    }
    if (minAmountMinor < 0n) {
      return { ok: false, error: "Threshold cannot be negative." };
    }

    const flow = await ensureFlow(org.id, module);
    const last = await db.approvalLevel.findFirst({
      where: { flowId: flow.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    await db.approvalLevel.create({
      data: {
        flowId: flow.id,
        position: (last?.position ?? 0) + 1,
        name,
        mode: mode as ApprovalMode,
        quorumCount,
        minAmountMinor,
      },
    });

    revalidatePath(`/o/${slug}/settings/approvals`);
    return { ok: true, message: "Level added — now assign approvers to it." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeLevelAction(
  slug: string,
  levelId: string,
): Promise<FlowActionState> {
  try {
    const { org } = await requireOrgManage(slug);
    const level = await db.approvalLevel.findUnique({
      where: { id: levelId },
      include: { flow: true },
    });
    if (!level || level.flow.orgId !== org.id) {
      return { ok: false, error: "Unknown level." };
    }

    await db.approvalLevel.delete({ where: { id: levelId } });

    // Close the gap so positions stay 1,2,3 — a ladder with a missing
    // rung reads as a bug to whoever looks at it next.
    const rest = await db.approvalLevel.findMany({
      where: { flowId: level.flowId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    for (const [i, l] of rest.entries()) {
      await db.approvalLevel.update({
        where: { id: l.id },
        data: { position: i + 1 },
      });
    }

    revalidatePath(`/o/${slug}/settings/approvals`);
    return { ok: true, message: "Level removed." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setLevelApproversAction(
  slug: string,
  levelId: string,
  userIds: string[],
): Promise<FlowActionState> {
  try {
    const { org } = await requireOrgManage(slug);
    const level = await db.approvalLevel.findUnique({
      where: { id: levelId },
      include: { flow: true },
    });
    if (!level || level.flow.orgId !== org.id) {
      return { ok: false, error: "Unknown level." };
    }

    // Only members of this org can be approvers in it.
    const members = await db.orgMember.findMany({
      where: { orgId: org.id, userId: { in: userIds } },
      select: { userId: true },
    });
    const valid = members.map((m) => m.userId);

    await db.$transaction([
      db.approvalLevelApprover.deleteMany({ where: { levelId } }),
      db.approvalLevelApprover.createMany({
        data: valid.map((userId) => ({ levelId, userId })),
        skipDuplicates: true,
      }),
    ]);

    // The database is the intent; the chain is the enforcement. Push the
    // set so this level can actually authorise a payment — a level the
    // contract doesn't know about can collect signatures all day and
    // still never release money.
    const sync = await syncApprovers(org.id, levelId);

    revalidatePath(`/o/${slug}/settings/approvals`);

    const who = `${valid.length} approver${valid.length === 1 ? "" : "s"} on this level.`;
    if (!sync.ok) {
      return {
        ok: true,
        message: `${who} Not yet registered on Arc — ${sync.error}. Save again to retry; until it lands this level cannot authorise payment.`,
      };
    }
    if (sync.skipped) {
      return { ok: true, message: `${who} ${sync.reason} — not registered on Arc.` };
    }
    return {
      ok: true,
      message: `${who} Registered on Arc in ${sync.tx.hash.slice(0, 10)}…`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
