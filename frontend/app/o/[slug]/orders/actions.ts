"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { POStatus, PRStatus, Role, VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { nextPoNumber, withNumberRetry } from "@/lib/procurement/numbering";
import { budgetPosition } from "@/lib/procurement/precheck";
import { commitOrderOnchain } from "@/lib/procurement/onchain";
import { formatUsd } from "@/lib/units";
import { renderPurchaseOrderEmail } from "@/lib/mail/po-templates";
import { renderOrderMessageEmail } from "@/lib/mail/vendor-response-templates";
import { sendEmail } from "@/lib/mail/send";

export type OrderActionState = {
  ok: boolean;
  id?: string;
  poNumber?: string;
  message?: string;
  error?: string;
};

async function canIssue(slug: string) {
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

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * Issue a purchase order from an approved request.
 *
 * This is the moment the organisation commits: the budget is encumbered
 * from here, and the vendor is told what has been ordered. Issuing is the
 * purchaser's job, not the approver's — approving says the spend is
 * sanctioned, issuing says the order has been placed.
 */
export async function issueOrderAction(
  slug: string,
  requestId: string,
): Promise<OrderActionState> {
  try {
    const ctx = await canIssue(slug);
    if (!ctx) {
      return { ok: false, error: "Only purchasers and controllers can issue orders." };
    }
    const { org } = ctx;

    const pr = await db.purchaseRequest.findUnique({
      where: { id: requestId },
      include: { vendor: true, department: true, order: true, lines: true },
    });
    if (!pr || pr.orgId !== org.id) {
      return { ok: false, error: "Unknown request." };
    }
    if (pr.status !== PRStatus.APPROVED) {
      return {
        ok: false,
        error: "Only an approved request can become a purchase order.",
      };
    }
    if (pr.order) {
      return {
        ok: false,
        error: `Already issued as ${pr.order.poNumber}.`,
      };
    }

    // Re-check budget at issue time. Approval may have happened days ago
    // and other orders may have consumed the headroom since — the money
    // is committed here, not when someone signed.
    const budget = await budgetPosition(pr.departmentId);
    if (budget.available < pr.amountMinor) {
      return {
        ok: false,
        error: `${pr.department.name} has ${formatUsd(budget.available)} uncommitted but this order needs ${formatUsd(pr.amountMinor)}. Budget was consumed after this was approved.`,
      };
    }

    if (pr.vendor.status !== "ACTIVE") {
      return {
        ok: false,
        error: `${pr.vendor.name} is no longer active — it cannot be ordered from.`,
      };
    }

    const tolerance = Number(process.env.MATCH_TOLERANCE_BPS ?? 100);

    const order = await withNumberRetry(async () => {
      const poNumber = await nextPoNumber(org.id);
      return db.purchaseOrder.create({
        data: {
          orgId: org.id,
          poNumber,
          status: POStatus.ISSUED,
          amountMinor: pr.amountMinor,
          toleranceBps: tolerance,
          requestId: pr.id,
          departmentId: pr.departmentId,
          vendorId: pr.vendorId,
        },
      });
    });

    // Fix the terms on-chain before anyone signs anything. The amount an
    // approver signs is read back from here at payment, so approving one
    // figure and paying another isn't caught afterwards — it can't happen.
    const committed = await commitOrderOnchain(org.id, order.id);

    // Tell the vendor. The PO is a document they act on, not a
    // notification — it carries what was ordered and what it's worth.
    const email = renderPurchaseOrderEmail({
      poNumber: order.poNumber,
      orgName: org.name,
      vendorName: pr.vendor.name,
      recipientEmail: pr.vendor.email,
      amount: formatUsd(pr.amountMinor),
      paymentTerms: pr.vendor.paymentTerms,
      lines: pr.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        amount: formatUsd(l.amountMinor),
      })),
      portalUrl:
        pr.vendor.portalStatus === VendorPortalStatus.ACTIVE
          ? `${appUrl()}/vendor`
          : pr.vendor.portalToken
            ? `${appUrl()}/vendor/${pr.vendor.portalToken}`
            : `${appUrl()}/vendor`,
    });

    await sendEmail({
      event: `PO_ISSUED:${order.id}`,
      recipient: pr.vendor.email,
      template: "purchase-order",
      email,
    });

    revalidatePath(`/o/${slug}/orders`);
    revalidatePath(`/o/${slug}/requests/${requestId}`);
    revalidatePath(`/o/${slug}/requests`);
    revalidatePath("/vendor");

    const onchain = committed.ok
      ? committed.skipped
        ? ` Not committed on Arc — ${committed.reason}.`
        : ` Committed on Arc in ${committed.tx.hash.slice(0, 10)}…`
      : ` Not committed on Arc — ${committed.error}. It cannot be paid until it is.`;

    return {
      ok: true,
      id: order.id,
      poNumber: order.poNumber,
      message: `${order.poNumber} issued — ${formatUsd(pr.amountMinor)} committed against ${pr.department.name}.${onchain}`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Reply to the vendor on an order.
 *
 * The thread is the same one the vendor sees in their portal — a
 * question about a line that gets answered by email lands nowhere the
 * three-way match can ever see it.
 */
export async function addOrgCommentAction(
  slug: string,
  orderId: string,
  body: string,
): Promise<OrderActionState> {
  try {
    const ctx = await requireOrgAccess(slug);

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { vendor: { select: { email: true, name: true } } },
    });
    if (!order || order.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown order." };
    }
    if (body.trim().length === 0) {
      return { ok: false, error: "Write something first." };
    }

    const comment = await db.poComment.create({
      data: { orderId, body: body.trim(), author: "ORG" },
    });

    await sendEmail({
      event: `PO_MESSAGE:${comment.id}`,
      recipient: order.vendor.email,
      template: "po-message",
      email: renderOrderMessageEmail({
        poNumber: order.poNumber,
        fromName: ctx.org.name,
        recipientEmail: order.vendor.email,
        body: comment.body,
        orderUrl: `${appUrl()}/vendor/orders/${order.id}`,
      }),
    });

    revalidatePath(`/o/${slug}/orders/${orderId}`);
    revalidatePath(`/vendor/orders/${orderId}`);
    return { ok: true, message: "Sent to the vendor." };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelOrderAction(
  slug: string,
  orderId: string,
  reason: string,
): Promise<OrderActionState> {
  try {
    const ctx = await canIssue(slug);
    if (!ctx) return { ok: false, error: "Not permitted." };

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { bill: true },
    });
    if (!order || order.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown order." };
    }
    if (order.bill) {
      return {
        ok: false,
        error: "A bill has already been recorded against this order.",
      };
    }

    await db.purchaseOrder.update({
      where: { id: orderId },
      data: {
        status: POStatus.CANCELLED,
        vendorResponseReason: reason.trim() || null,
      },
    });

    revalidatePath(`/o/${slug}/orders`);
    revalidatePath(`/o/${slug}/orders/${orderId}`);
    return { ok: true, message: `${order.poNumber} cancelled — budget released.` };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
