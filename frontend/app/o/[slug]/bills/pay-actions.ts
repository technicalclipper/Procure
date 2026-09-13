"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { payBill } from "@/lib/procurement/payment";
import { formatUsd } from "@/lib/units";

export type PayState = {
  ok: boolean;
  txHash?: string;
  message?: string;
  error?: string;
  reverted?: boolean;
};

/**
 * Releasing funds is the purchaser's job — not the approver's, and not
 * the person who booked the goods in. They cannot decide *whether* to
 * pay: the match and the signatures decided that, and the contract
 * enforces it. What they decide is when to press the button.
 */
export async function payBillAction(
  slug: string,
  billId: string,
): Promise<PayState> {
  try {
    const ctx = await requireOrgAccess(slug);

    const bill = await db.bill.findUnique({
      where: { id: billId },
      select: { orgId: true, billNumber: true },
    });
    if (!bill || bill.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown bill." };
    }

    if (!ctx.canManage) {
      const purchaser = await db.membership.findFirst({
        where: {
          userId: ctx.user.id,
          role: Role.PURCHASER,
          department: { orgId: ctx.org.id },
        },
        select: { id: true },
      });
      if (!purchaser) {
        return { ok: false, error: "Only purchasers and controllers can release payment." };
      }
    }

    const result = await payBill(billId);

    revalidatePath(`/o/${slug}/bills/${billId}`);
    revalidatePath(`/o/${slug}/bills`);
    revalidatePath(`/o/${slug}/payments`);
    revalidatePath(`/vendor`);

    if (!result.ok) {
      return { ok: false, error: result.error, reverted: result.reverted };
    }

    return {
      ok: true,
      txHash: result.txHash,
      message: `${bill.billNumber} paid — ${formatUsd(result.amountMinor)} settled on Arc in block ${result.blockNumber}.`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
