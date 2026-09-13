"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { recordDecision } from "@/lib/procurement/approvals";
import { verifyApprovalSignature } from "@/lib/procurement/signing";

export type DecisionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

export async function decideAction(
  slug: string,
  requestId: string,
  approved: boolean,
  comment: string,
  signature: string | null = null,
): Promise<DecisionState> {
  try {
    const { org, user } = await requireOrgAccess(slug);

    const pr = await db.purchaseRequest.findUnique({
      where: { id: requestId },
      select: { orgId: true },
    });
    if (!pr || pr.orgId !== org.id) {
      return { ok: false, error: "Unknown request." };
    }

    // Verify before storing. A signature we never checked is worse than
    // none — it looks like proof in the audit trail and isn't, and the
    // contract would reject it at payment when it's far too late to ask
    // the approver to sign again.
    if (approved && signature) {
      const check = await verifyApprovalSignature(
        requestId,
        user.walletAddress,
        signature,
      );
      if (!check.ok) return { ok: false, error: check.error };
    }

    const result = await recordDecision({
      requestId,
      userId: user.id,
      userName: user.name ?? user.email,
      approved,
      comment: comment.trim() || null,
      signature,
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath(`/o/${slug}/requests/${requestId}`);
    revalidatePath(`/o/${slug}/requests`);
    revalidatePath(`/o/${slug}/approvals`);
    return { ok: true, message: result.message };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
