import { ApprovalMode, ApprovalModule } from "@prisma/client";
import { db } from "../db";
import { formatUsd } from "../units";

/**
 * Approval configuration, resolved per organisation and module.
 *
 * A flow can be disabled outright — "this module needs no approval" is a
 * legitimate choice for a small team, not a degenerate case. When it is
 * enabled, the levels whose threshold the amount meets apply in order.
 */

export type LevelSnapshot = {
  position: number;
  name: string | null;
  minAmountMinor: string;
  mode: ApprovalMode;
  quorumCount: number;
  /** Required at this level, derived from mode + approvers */
  required: number;
  approverIds: string[];
  approverNames: string[];
};

export type FlowSnapshot = {
  module: ApprovalModule;
  enabled: boolean;
  levels: LevelSnapshot[];
};

function requiredFor(
  mode: ApprovalMode,
  quorumCount: number,
  approverCount: number,
): number {
  if (approverCount === 0) return 0;
  if (mode === ApprovalMode.ALL) return approverCount;
  if (mode === ApprovalMode.QUORUM) {
    return Math.min(Math.max(1, quorumCount), approverCount);
  }
  return 1;
}

export async function getFlow(orgId: string, module: ApprovalModule) {
  return db.approvalFlow.findUnique({
    where: { orgId_module: { orgId, module } },
    include: {
      levels: {
        orderBy: { position: "asc" },
        include: {
          approvers: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
}

/**
 * Freeze the levels that apply to this amount.
 *
 * Snapshotting is the point: if a controller edits the flow while a
 * request is in flight, the bar it was submitted under is the bar it
 * clears. Otherwise the audit trail cannot be reconstructed.
 */
export async function snapshotFlow(
  orgId: string,
  module: ApprovalModule,
  amountMinor: bigint,
): Promise<FlowSnapshot> {
  const flow = await getFlow(orgId, module);

  if (!flow || !flow.enabled) {
    return { module, enabled: false, levels: [] };
  }

  const levels: LevelSnapshot[] = flow.levels
    .filter((l) => amountMinor >= l.minAmountMinor)
    .map((l) => ({
      position: l.position,
      name: l.name,
      minAmountMinor: l.minAmountMinor.toString(),
      mode: l.mode,
      quorumCount: l.quorumCount,
      required: requiredFor(l.mode, l.quorumCount, l.approvers.length),
      approverIds: l.approvers.map((a) => a.userId),
      approverNames: l.approvers.map((a) => a.user.name ?? a.user.email),
    }));

  return { module, enabled: true, levels };
}

/** Total approvals needed across every applicable level. */
export function totalRequired(snapshot: FlowSnapshot): number {
  if (!snapshot.enabled) return 0;
  return snapshot.levels.reduce((s, l) => s + l.required, 0);
}

export function describeFlow(snapshot: FlowSnapshot): string {
  if (!snapshot.enabled) return "No approval required for this module.";
  if (snapshot.levels.length === 0) {
    return "No level applies at this amount — approved automatically.";
  }
  return snapshot.levels
    .map((l) => {
      const who =
        l.mode === ApprovalMode.ALL
          ? `all ${l.approverIds.length}`
          : l.mode === ApprovalMode.QUORUM
            ? `${l.required} of ${l.approverIds.length}`
            : "any one";
      return `L${l.position} ${who}`;
    })
    .join(" → ");
}

export function describeLevelRule(l: {
  mode: ApprovalMode;
  quorumCount: number;
  approverCount: number;
  minAmountMinor: bigint;
}): string {
  const who =
    l.mode === ApprovalMode.ALL
      ? `all ${l.approverCount}`
      : l.mode === ApprovalMode.QUORUM
        ? `${Math.min(l.quorumCount, Math.max(1, l.approverCount))} of ${l.approverCount}`
        : "any 1";
  const from =
    l.minAmountMinor > 0n ? ` at or above ${formatUsd(l.minAmountMinor)}` : "";
  return `${who} must approve${from}`;
}

/**
 * Ensure a flow row exists so the settings page has something to edit.
 * Defaults to disabled — an org that has not configured approvals should
 * not have requests silently stuck waiting for nobody.
 */
export async function ensureFlow(orgId: string, module: ApprovalModule) {
  return db.approvalFlow.upsert({
    where: { orgId_module: { orgId, module } },
    update: {},
    create: { orgId, module, enabled: false },
  });
}
