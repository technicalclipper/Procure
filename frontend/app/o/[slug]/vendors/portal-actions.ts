"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Role, VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { renderVendorPortalInvite } from "@/lib/mail/vendor-templates";
import { sendEmail } from "@/lib/mail/send";

export type PortalActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  /** The claim link, so it can be copied when email can't be delivered. */
  link?: string;
  emailed?: boolean;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

async function canManageVendors(slug: string) {
  const ctx = await requireOrgAccess(slug);
  if (ctx.canManage) return ctx;
  const purchaser = await db.membership.findFirst({
    where: {
      userId: ctx.user.id,
      role: Role.PURCHASER,
      department: { orgId: ctx.org.id },
    },
    select: { id: true },
  });
  return purchaser ? ctx : null;
}

/**
 * Invite the vendor to their portal.
 *
 * Re-inviting rotates the token, so an older link stops working. A
 * supplier's mailbox is outside our control and old invitation links get
 * forwarded around; only the most recent one should open a door.
 */
export async function inviteVendorPortalAction(
  slug: string,
  vendorId: string,
): Promise<PortalActionState> {
  try {
    const ctx = await canManageVendors(slug);
    if (!ctx) {
      return { ok: false, error: "Only purchasers and controllers can do this." };
    }

    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || vendor.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown vendor." };
    }
    if (vendor.portalStatus === VendorPortalStatus.ACTIVE) {
      return { ok: false, error: `${vendor.name} has already claimed the portal.` };
    }

    const token = randomBytes(24).toString("base64url");

    await db.vendor.update({
      where: { id: vendorId },
      data: {
        portalToken: token,
        portalStatus: VendorPortalStatus.INVITED,
        portalInvitedAt: new Date(),
      },
    });

    const email = renderVendorPortalInvite({
      vendorName: vendor.name,
      orgName: ctx.org.name,
      inviterName: ctx.user.name ?? ctx.user.email,
      inviterEmail: ctx.user.email,
      recipientEmail: vendor.email,
      acceptUrl: `${appUrl()}/vendor/${token}`,
    });

    const link = `${appUrl()}/vendor/${token}`;

    const sent = await sendEmail({
      event: `VENDOR_PORTAL_INVITE:${vendorId}`,
      recipient: vendor.email,
      template: "vendor-portal-invite",
      email,
    });

    revalidatePath(`/o/${slug}/vendors`);
    revalidatePath(`/o/${slug}/vendors/${vendorId}`);

    // The link is always returned. Provider-level delivery is outside our
    // control — an unverified sending domain, a bounce, a spam filter —
    // and none of that should stop someone onboarding a supplier.
    return {
      ok: true,
      emailed: sent.sent,
      link,
      message: sent.sent
        ? `Portal invitation emailed to ${vendor.email}.`
        : `Invitation ready for ${vendor.email}. Share the link below — it's also in the outbox.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeVendorPortalAction(
  slug: string,
  vendorId: string,
): Promise<PortalActionState> {
  try {
    const ctx = await canManageVendors(slug);
    if (!ctx) return { ok: false, error: "Not permitted." };

    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || vendor.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown vendor." };
    }

    await db.vendor.update({
      where: { id: vendorId },
      data: {
        portalToken: null,
        portalUserId: null,
        portalActivatedAt: null,
        portalStatus: VendorPortalStatus.NOT_INVITED,
      },
    });

    revalidatePath(`/o/${slug}/vendors`);
    revalidatePath(`/o/${slug}/vendors/${vendorId}`);
    return { ok: true, message: `Portal access revoked for ${vendor.name}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
