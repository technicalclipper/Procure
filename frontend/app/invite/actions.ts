"use server";

import { revalidatePath } from "next/cache";
import { InvitationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { acceptInvitation, type AcceptResult } from "@/lib/invitations";

export async function acceptInvitationAction(
  token: string,
): Promise<AcceptResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to accept this invitation." };

  const result = await acceptInvitation(token, user);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/o/${result.slug}`);
    revalidatePath(`/o/${result.slug}/settings/people`);
  }
  return result;
}

export async function declineInvitationAction(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const inv = await db.invitation.findUnique({ where: { token } });
  if (!inv) return { ok: false, error: "That invitation isn't valid." };
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: "That invitation isn't addressed to you." };
  }
  if (inv.status !== InvitationStatus.PENDING) {
    return { ok: false, error: "That invitation is no longer pending." };
  }

  await db.invitation.update({
    where: { id: inv.id },
    data: { status: InvitationStatus.REVOKED },
  });

  revalidatePath("/");
  return { ok: true };
}
