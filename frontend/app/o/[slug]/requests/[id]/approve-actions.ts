"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { recordDecision } from "@/lib/procurement/approvals";

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

    const result = await recordDecision({
      requestId,
      userId: user.id,
      userName: user.name ?? user.email,
      approved,
      comment: comment.trim() || null,
      // Signing with the approver's own Privy wallet lands with the
      // registry work; the decision is recorded against their identity
      // either way.
      signature: null,
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath(`/o/${slug}/requests/${requestId}`);
    revalidatePath(`/o/${slug}/requests`);
    revalidatePath(`/o/${slug}/approvals`);
    return { ok: true, message: result.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
