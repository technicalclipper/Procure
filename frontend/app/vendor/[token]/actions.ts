"use server";

import { revalidatePath } from "next/cache";
import { VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export type ClaimResult = { ok: true } | { ok: false; error: string };

/**
 * Claim vendor portal access.
 *
 * As with org invitations, the token proves you received the link and the
 * email is what authorises the claim — a forwarded link should show the
 * invitation, not hand over the supplier's account.
 */
export async function claimVendorPortalAction(
  token: string,
): Promise<ClaimResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to claim this portal." };

  const vendor = await db.vendor.findUnique({
    where: { portalToken: token },
    include: { org: { select: { slug: true } } },
  });
  if (!vendor) return { ok: false, error: "That link isn't valid." };

  if (vendor.portalStatus === VendorPortalStatus.ACTIVE) {
    return vendor.portalUserId === user.id
      ? { ok: true }
      : { ok: false, error: "This portal has already been claimed." };
  }

  if (vendor.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invitation is for ${vendor.email}. You're signed in as ${user.email}.`,
    };
  }

  await db.vendor.update({
    where: { id: vendor.id },
    data: {
      portalUserId: user.id,
      portalStatus: VendorPortalStatus.ACTIVE,
      portalActivatedAt: new Date(),
    },
  });

  revalidatePath("/vendor");
  revalidatePath(`/o/${vendor.org.slug}/vendors`);
  revalidatePath(`/o/${vendor.org.slug}/vendors/${vendor.id}`);
  return { ok: true };
}
