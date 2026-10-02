"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { POStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireVendorPortal } from "@/lib/vendor-portal";
import { formatUsd, parseUsd } from "@/lib/units";
import { computeVariance } from "@/lib/procurement/match";
import { sendEmail } from "@/lib/mail/send";
import { renderInvoiceSubmittedEmail } from "@/lib/mail/invoice-templates";
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
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Submit an invoice against an order.
 *
 * The vendor types their own number. Nothing is prefilled from the
 * purchase order, and that is the whole point — a bill generated from
 * the PO would match itself by construction and the three-way match
 * would be theatre. The variance is computed from what they actually
 * claim, and they are shown it before they send.
 */
export async function submitInvoiceAction(
  orderId: string,
  invoiceNumber: string,
  amount: string,
  note: string,
): Promise<VendorActionState> {
  try {
    const { vendorIds } = await requireVendorPortal();

    const number = invoiceNumber.trim();
    if (number.length === 0) {
      return { ok: false, error: "Give your invoice number." };
    }

    let invoicedMinor: bigint;
    try {
      invoicedMinor = parseUsd(amount);
    } catch {
      return { ok: false, error: "That isn't a valid amount." };
    }
    if (invoicedMinor <= 0n) {
      return { ok: false, error: "An invoice has to be for more than zero." };
    }

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        org: { select: { slug: true, name: true, owner: { select: { email: true } } } },
        vendor: { select: { id: true, name: true } },
        receipt: { select: { grnNumber: true } },
        invoice: { select: { vendorInvoiceNumber: true } },
        request: { select: { requester: { select: { email: true } } } },
      },
    });
    if (!order || !vendorIds.includes(order.vendorId)) {
      return { ok: false, error: "Unknown order." };
    }
    if (order.invoice) {
      return {
        ok: false,
        error: `You've already invoiced this order as ${order.invoice.vendorInvoiceNumber}.`,
      };
    }
    if (!order.receipt) {
      return {
        ok: false,
        error: `${order.org.name} hasn't confirmed delivery yet. An invoice raised before receipt has nothing to match against — you'll be emailed the moment it's booked in.`,
      };
    }

    const variance = computeVariance(
      order.amountMinor,
      invoicedMinor,
      order.toleranceBps,
    );

    let invoice;
    try {
      invoice = await db.vendorInvoice.create({
        data: {
          orgId: order.orgId,
          vendorId: order.vendorId,
          orderId: order.id,
          vendorInvoiceNumber: number,
          invoicedAmountMinor: invoicedMinor,
          note: note.trim() || null,
        },
      });
    } catch (e) {
      unstable_rethrow(e);
      // Unique on (vendorId, vendorInvoiceNumber) — the same supplier
      // sending the same number twice is a duplicate-invoice attempt,
      // which is exactly what the index is there to stop.
      if ((e as { code?: string })?.code === "P2002") {
        return {
          ok: false,
          error: `You've already used invoice number ${number} on another order.`,
        };
      }
      throw e;
    }

    const orderUrl = `${appUrl()}/o/${order.org.slug}/orders/${order.id}`;
    for (const recipient of buyerRecipients(
      order.request.requester.email,
      order.org.owner.email,
    )) {
      await sendEmail({
        event: `INVOICE_SUBMITTED:${invoice.id}`,
        recipient,
        template: variance.withinTolerance
          ? "invoice-matched"
          : "invoice-variance",
        email: renderInvoiceSubmittedEmail({
          vendorInvoiceNumber: invoice.vendorInvoiceNumber,
          poNumber: order.poNumber,
          grnNumber: order.receipt.grnNumber,
          orgName: order.org.name,
          vendorName: order.vendor.name,
          recipientEmail: recipient,
          orderedAmount: formatUsd(order.amountMinor),
          invoicedAmount: formatUsd(invoicedMinor),
          variance: variance.formatted,
          withinTolerance: variance.withinTolerance,
          tolerancePercent: variance.tolerancePercent,
          note: invoice.note,
          orderUrl,
        }),
      });
    }

    revalidatePath("/vendor");
    revalidatePath(`/vendor/orders/${orderId}`);
    revalidatePath(`/o/${order.org.slug}/orders/${orderId}`);
    revalidatePath(`/o/${order.org.slug}/bills`);

    return {
      ok: true,
      message: variance.withinTolerance
        ? `${number} submitted. It agrees with ${order.poNumber} — payment releases on the match.`
        : `${number} submitted, but it's ${variance.formatted} against ${order.poNumber}. That's outside the agreed ${variance.tolerancePercent}, so ${order.org.name} has to resolve it before anything can be paid.`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
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
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
