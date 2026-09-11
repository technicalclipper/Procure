"use server";

import { revalidatePath } from "next/cache";
import { POStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireVendorPortal } from "@/lib/vendor-portal";
import { formatUsd } from "@/lib/units";
import { sendEmail } from "@/lib/mail/send";
import {
  renderOrderMessageEmail,
  renderVendorResponseEmail,
} from "@/lib/mail/vendor-response-templates";

export type VendorActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * Who on the buying side should hear about this order.
 *
 * The requester raised it and the owner carries the budget, so both are
 * told. Deduplicated by email — on a small org they are frequently the
 * same person, and two identical mails read as a bug.
 */
function buyerRecipients(
  requesterEmail: string,
  ownerEmail: string,
): string[] {
  return Array.from(new Set([requesterEmail, ownerEmail]));
}

/**
 * Accept or reject a purchase order.
 *
 * Acceptance is the vendor confirming they can supply what was ordered.
 * Rejecting requires a reason — a supplier declining silently leaves the
 * buyer with a committed budget and no idea why.
 */
export async function respondToOrderAction(
  orderId: string,
  accept: boolean,
  reason: string,
): Promise<VendorActionState> {
  try {
    const { vendorIds } = await requireVendorPortal();

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        org: { select: { slug: true, name: true, owner: { select: { email: true } } } },
        vendor: { select: { name: true } },
        request: { select: { requester: { select: { email: true } } } },
      },
    });
    if (!order || !vendorIds.includes(order.vendorId)) {
      return { ok: false, error: "Unknown order." };
    }
    if (order.status !== POStatus.ISSUED) {
      return {
        ok: false,
        error: `This order is already ${order.status.toLowerCase().replace("vendor_", "").replace("_", " ")}.`,
      };
    }
    if (!accept && reason.trim().length === 0) {
      return { ok: false, error: "Give a reason for rejecting." };
    }

    const note = reason.trim() || null;

    await db.purchaseOrder.update({
      where: { id: orderId },
      data: {
        status: accept ? POStatus.VENDOR_ACCEPTED : POStatus.VENDOR_REJECTED,
        vendorResponseAt: new Date(),
        vendorResponseReason: note,
      },
    });

    const orderUrl = `${appUrl()}/o/${order.org.slug}/orders/${order.id}`;
    for (const recipient of buyerRecipients(
      order.request.requester.email,
      order.org.owner.email,
    )) {
      await sendEmail({
        event: `PO_RESPONSE:${order.id}`,
        recipient,
        template: accept ? "po-accepted" : "po-rejected",
        email: renderVendorResponseEmail({
          poNumber: order.poNumber,
          orgName: order.org.name,
          vendorName: order.vendor.name,
          recipientEmail: recipient,
          amount: formatUsd(order.amountMinor),
          accepted: accept,
          reason: note,
          orderUrl,
        }),
      });
    }

    revalidatePath("/vendor");
    revalidatePath(`/vendor/orders/${orderId}`);
    revalidatePath(`/o/${order.org.slug}/orders`);
    revalidatePath(`/o/${order.org.slug}/orders/${orderId}`);

    return {
      ok: true,
      message: accept
        ? `${order.poNumber} accepted. Submit your invoice once delivered.`
        : `${order.poNumber} rejected.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addVendorCommentAction(
  orderId: string,
  body: string,
): Promise<VendorActionState> {
  try {
    const { vendorIds } = await requireVendorPortal();

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        org: { select: { slug: true, owner: { select: { email: true } } } },
        vendor: { select: { name: true } },
        request: { select: { requester: { select: { email: true } } } },
      },
    });
    if (!order || !vendorIds.includes(order.vendorId)) {
      return { ok: false, error: "Unknown order." };
    }
    if (body.trim().length === 0) {
      return { ok: false, error: "Write something first." };
    }

    const comment = await db.poComment.create({
      data: { orderId, body: body.trim(), author: "VENDOR" },
    });

    const orderUrl = `${appUrl()}/o/${order.org.slug}/orders/${order.id}`;
    for (const recipient of buyerRecipients(
      order.request.requester.email,
      order.org.owner.email,
    )) {
      await sendEmail({
        event: `PO_MESSAGE:${comment.id}`,
        recipient,
        template: "po-message",
        email: renderOrderMessageEmail({
          poNumber: order.poNumber,
          fromName: order.vendor.name,
          recipientEmail: recipient,
          body: comment.body,
          orderUrl,
        }),
      });
    }

    revalidatePath(`/vendor/orders/${orderId}`);
    revalidatePath(`/o/${order.org.slug}/orders/${orderId}`);
    return { ok: true, message: "Comment added." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
