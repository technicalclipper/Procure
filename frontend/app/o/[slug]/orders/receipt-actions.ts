"use server";

import { revalidatePath } from "next/cache";
import { POStatus, Role, VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { nextGrnNumber, withNumberRetry } from "@/lib/procurement/numbering";
import { formatUsd } from "@/lib/units";
import { renderGoodsReceiptEmail } from "@/lib/mail/grn-templates";
import { sendEmail } from "@/lib/mail/send";
import { postGoodsReceipt } from "@/lib/ledger/post";

export type ReceiptActionState = {
  ok: boolean;
  grnNumber?: string;
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
 * Who may confirm that goods arrived.
 *
 * The requesting side, or a controller. Deliberately not a purchaser
 * acting alone: the same person raising the order, booking it in and
 * releasing the payment is the oldest fraud in accounts payable, and a
 * three-way match that one person can satisfy end to end isn't a
 * control, it's paperwork.
 */
async function canReceive(slug: string, departmentId: string) {
  const ctx = await requireOrgAccess(slug);
  if (ctx.canManage) return ctx;

  const requester = await db.membership.findFirst({
    where: { userId: ctx.user.id, departmentId, role: Role.REQUESTER },
    select: { id: true },
  });
  return requester ? ctx : null;
}

/**
 * Book an order in as received.
 *
 * This is the leg of the three-way match that can't be produced from a
 * desk — the buyer's own people saying the goods are here. It unlocks
 * the vendor's ability to invoice, which is why they are told about it.
 */
export async function recordReceiptAction(
  slug: string,
  orderId: string,
  note: string,
): Promise<ReceiptActionState> {
  try {
    const pre = await requireOrgAccess(slug);

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        vendor: true,
        department: { select: { id: true, name: true } },
        receipt: { select: { grnNumber: true } },
        request: { select: { requester: { select: { email: true } } } },
      },
    });
    if (!order || order.orgId !== pre.org.id) {
      return { ok: false, error: "Unknown order." };
    }

    const ctx = await canReceive(slug, order.departmentId);
    if (!ctx) {
      return {
        ok: false,
        error: `Only a requester in ${order.department.name} or a controller can confirm receipt. Whoever pays should not also be the one who books the goods in.`,
      };
    }

    if (order.receipt) {
      return {
        ok: false,
        error: `Already received as ${order.receipt.grnNumber}.`,
      };
    }
    if (order.status === POStatus.ISSUED) {
      return {
        ok: false,
        error: `${order.vendor.name} hasn't accepted this order yet.`,
      };
    }
    if (
      order.status === POStatus.VENDOR_REJECTED ||
      order.status === POStatus.CANCELLED
    ) {
      return {
        ok: false,
        error: "This order is no longer live.",
      };
    }

    const receipt = await withNumberRetry(async () => {
      const grnNumber = await nextGrnNumber(ctx.org.id);
      return db.goodsReceipt.create({
        data: {
          orgId: ctx.org.id,
          grnNumber,
          orderId: order.id,
          receivedById: ctx.user.id,
          note: note.trim() || null,
        },
      });
    });

    await db.purchaseOrder.update({
      where: { id: order.id },
      data: { status: POStatus.RECEIVED },
    });

    // The liability exists from the moment goods arrive, not from the
    // moment somebody invoices for them. Dr Expense, Cr GR/IR.
    await postGoodsReceipt(receipt.id);

    const receivedBy = ctx.user.name ?? ctx.user.email;
    const amount = formatUsd(order.amountMinor);

    // The vendor's cue to invoice. Under a three-way match an invoice
    // raised before receipt has nothing to match against and just sits.
    await sendEmail({
      event: `GRN_RECORDED:${receipt.id}`,
      recipient: order.vendor.email,
      template: "goods-received-vendor",
      email: renderGoodsReceiptEmail({
        grnNumber: receipt.grnNumber,
        poNumber: order.poNumber,
        orgName: ctx.org.name,
        recipientEmail: order.vendor.email,
        receivedBy,
        amount,
        note: receipt.note,
        audience: "vendor",
        portalUrl:
          order.vendor.portalStatus === VendorPortalStatus.ACTIVE
            ? `${appUrl()}/vendor/orders/${order.id}`
            : order.vendor.portalToken
              ? `${appUrl()}/vendor/${order.vendor.portalToken}`
              : `${appUrl()}/vendor`,
      }),
    });

    await sendEmail({
      event: `GRN_RECORDED:${receipt.id}`,
      recipient: order.request.requester.email,
      template: "goods-received-buyer",
      email: renderGoodsReceiptEmail({
        grnNumber: receipt.grnNumber,
        poNumber: order.poNumber,
        orgName: ctx.org.name,
        recipientEmail: order.request.requester.email,
        receivedBy,
        amount,
        note: receipt.note,
        audience: "buyer",
        portalUrl: `${appUrl()}/o/${slug}/orders/${order.id}`,
      }),
    });

    revalidatePath(`/o/${slug}/orders`);
    revalidatePath(`/o/${slug}/orders/${orderId}`);
    revalidatePath(`/o/${slug}/receipts`);
    revalidatePath("/vendor");
    revalidatePath(`/vendor/orders/${orderId}`);

    return {
      ok: true,
      grnNumber: receipt.grnNumber,
      message: `${receipt.grnNumber} recorded. ${order.vendor.name} can now invoice against ${order.poNumber}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
