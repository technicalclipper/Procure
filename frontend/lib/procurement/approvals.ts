import { PRStatus } from "@prisma/client";
import { db } from "../db";
import type { FlowSnapshot, LevelSnapshot } from "./approval-flow";

/**
 * Collecting signatures against the ladder frozen onto a request.
 *
 * Everything here reads the request's own snapshot, never the org's live
 * configuration. A request approved yesterday must remain explicable
 * tomorrow even if the flow has been rewritten since.
 */

export type ApprovalView = {
  level: LevelSnapshot;
  given: number;
  required: number;
  satisfied: boolean;
  signedBy: string[];
  isCurrent: boolean;
};

export function readSnapshot(raw: unknown): FlowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as FlowSnapshot;
  return Array.isArray(s.levels) ? s : null;
}

/** Can this user sign at the request's current level? */
export function canApproveAt(
  snapshot: FlowSnapshot | null,
  currentLevel: number,
  userId: string,
): boolean {
  if (!snapshot?.enabled) return false;
  const level = snapshot.levels.find((l) => l.position === currentLevel);
  return !!level && level.approverIds.includes(userId);
}

export function buildLadder(
  snapshot: FlowSnapshot | null,
  currentLevel: number,
  approvals: { level: number; approved: boolean; approverId: string; name: string }[],
): ApprovalView[] {
  if (!snapshot?.enabled) return [];
  return snapshot.levels.map((level) => {
    const at = approvals.filter((a) => a.level === level.position && a.approved);
    return {
      level,
      given: at.length,
      required: level.required,
      satisfied: at.length >= level.required,
      signedBy: at.map((a) => a.name),
      isCurrent: level.position === currentLevel,
    };
  });
}

export type DecisionResult =
  | { ok: true; status: PRStatus; advancedTo?: number; message: string }
  | { ok: false; error: string };

/**
 * Record a decision and move the request on.
 *
 * A rejection ends it immediately rather than letting the remaining
 * approvers sign — once someone with authority has said no, collecting
 * more signatures is theatre.
 */
export async function recordDecision(input: {
  requestId: string;
  userId: string;
  userName: string;
  approved: boolean;
  comment: string | null;
  signature: string | null;
}): Promise<DecisionResult> {
  const pr = await db.purchaseRequest.findUnique({
    where: { id: input.requestId },
    include: { approvals: true },
  });
  if (!pr) return { ok: false, error: "Unknown request." };

  if (pr.status !== PRStatus.PENDING_APPROVAL) {
    return {
      ok: false,
      error: `This request is ${pr.status.toLowerCase().replace("_", " ")} — there is nothing to sign.`,
    };
  }

  const snapshot = readSnapshot(pr.flowSnapshot);
  if (!canApproveAt(snapshot, pr.currentLevel, input.userId)) {
    return {
      ok: false,
      error: "You're not an approver at the level this request is waiting on.",
    };
  }

  if (pr.approvals.some((a) => a.approverId === input.userId)) {
    return { ok: false, error: "You've already recorded a decision on this." };
  }

  if (!input.approved) {
    await db.$transaction([
      db.approval.create({
        data: {
          requestId: pr.id,
          approverId: input.userId,
          approved: false,
          comment: input.comment,
          signature: input.signature,
          level: pr.currentLevel,
        },
      }),
      db.purchaseRequest.update({
        where: { id: pr.id },
        data: {
          status: PRStatus.REJECTED,
          rejectionReason: input.comment,
        },
      }),
    ]);
    return {
      ok: true,
      status: PRStatus.REJECTED,
      message: `${input.userName} rejected this request.`,
    };
  }

  await db.approval.create({
    data: {
      requestId: pr.id,
      approverId: input.userId,
      approved: true,
      comment: input.comment,
      signature: input.signature,
      level: pr.currentLevel,
    },
  });

  const level = snapshot!.levels.find((l) => l.position === pr.currentLevel)!;
  const givenHere =
    pr.approvals.filter((a) => a.level === pr.currentLevel && a.approved)
      .length + 1;

  if (givenHere < level.required) {
    return {
      ok: true,
      status: PRStatus.PENDING_APPROVAL,
      message: `Recorded. ${givenHere} of ${level.required} at level ${level.position} — still waiting.`,
    };
  }

  const next = snapshot!.levels.find((l) => l.position > pr.currentLevel);

  if (next) {
    await db.purchaseRequest.update({
      where: { id: pr.id },
      data: { currentLevel: next.position },
    });
    return {
      ok: true,
      status: PRStatus.PENDING_APPROVAL,
      advancedTo: next.position,
      message: `Level ${level.position} satisfied — now with level ${next.position}.`,
    };
  }

  await db.purchaseRequest.update({
    where: { id: pr.id },
    data: { status: PRStatus.APPROVED },
  });
  return {
    ok: true,
    status: PRStatus.APPROVED,
    message: "Fully approved — ready to issue as a purchase order.",
  };
}

/** Requests waiting on this user's signature right now. */
export async function pendingForUser(orgId: string, userId: string) {
  const open = await db.purchaseRequest.findMany({
    where: { orgId, status: PRStatus.PENDING_APPROVAL },
    include: {
      vendor: { select: { name: true } },
      department: { select: { code: true, name: true } },
      requester: { select: { name: true, email: true } },
      approvals: { select: { approverId: true, level: true, approved: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return open.filter((pr) => {
    const snapshot = readSnapshot(pr.flowSnapshot);
    if (!canApproveAt(snapshot, pr.currentLevel, userId)) return false;
    // Already signed — it is waiting on someone else, not on them.
    return !pr.approvals.some((a) => a.approverId === userId);
  });
}
