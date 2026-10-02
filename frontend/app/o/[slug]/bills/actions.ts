"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import {
  BillStatus,
  MatchOutcome as MatchOutcomeEnum,
  Role,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { nextBillNumber, withNumberRetry } from "@/lib/procurement/numbering";
import { runThreeWayMatch } from "@/lib/procurement/three-way";
import { formatUsd } from "@/lib/units";
import { renderMatchResultEmail } from "@/lib/mail/bill-templates";
import { sendEmail } from "@/lib/mail/send";
import { postBill } from "@/lib/ledger/post";
import { autoSettle } from "@/lib/procurement/automation";

export type BillActionState = {
  ok: boolean;
  id?: string;
  billNumber?: string;
  matched?: boolean;
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
 * Bills are the purchaser's ledger. Segregation of duties bites on
 * receipt (which they cannot do) and on approval — raising the bill
 * itself decides nothing, because the match decides it.
 */
async function canBill(slug: string) {
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

const ORDER_INCLUDE = {
  org: { select: { slug: true, name: true, owner: { select: { email: true } } } },
  vendor: { select: { name: true, status: true, email: true } },
  receipt: { select: { grnNumber: true, createdAt: true } },
  invoice: {
    select: { vendorInvoiceNumber: true, invoicedAmountMinor: true },
  },
  request: { select: { requester: { select: { email: true } } } },
} as const;

/**
 * Raise a bill against an order and run the match.
 *
 * The match runs on creation rather than on demand, because a bill whose
 * match hasn't been evaluated is a bill somebody might pay. The result is
 * persisted as a MatchResult row — the variance, the tolerance it was
 * tested against and the reason — so the decision can be audited later
 * rather than recomputed against whatever the configuration says then.
 */
export async function createBillAction(
  slug: string,
  orderId: string,
): Promise<BillActionState> {
  try {
    const ctx = await canBill(slug);
    if (!ctx) {
      return { ok: false, error: "Only purchasers and controllers can raise bills." };
    }

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { ...ORDER_INCLUDE, bill: { select: { billNumber: true } } },
    });
    if (!order || order.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown order." };
    }
    if (order.bill) {
      return { ok: false, error: `Already billed as ${order.bill.billNumber}.` };
    }
    if (!order.invoice) {
      return {
        ok: false,
        error: `${order.vendor.name} hasn't invoiced ${order.poNumber} yet. A bill raised without their invoice would only be matching the order against itself.`,
      };
    }

    const match = runThreeWayMatch(order);

    const bill = await withNumberRetry(async () => {
      const billNumber = await nextBillNumber(ctx.org.id);
      return db.bill.create({
        data: {
          orgId: ctx.org.id,
          billNumber,
          orderId: order.id,
          status: match.passed ? BillStatus.MATCHED : BillStatus.MATCH_FAILED,
          // Both figures, kept apart on purpose — see three-way.ts
          poAmountMinor: order.amountMinor,
          invoicedAmountMinor: order.invoice!.invoicedAmountMinor,
          matches: {
            create: {
              outcome: match.passed
                ? MatchOutcomeEnum.PASS
                : MatchOutcomeEnum.FAIL,
              reason: match.reason,
              varianceMinor: match.variance?.deltaMinor ?? 0n,
              toleranceMinor: match.variance?.toleranceMinor ?? 0n,
            },
          },
        },
      });
    });

    // Dr GR/IR, Cr Payables. Any variance between ordered and invoiced
    // stays in GR/IR, where it can't be dismissed.
    if (match.passed) await postBill(bill.id);

    const billUrl = `${appUrl()}/o/${slug}/bills/${bill.id}`;
    for (const recipient of Array.from(
      new Set([order.request.requester.email, order.org.owner.email]),
    )) {
      await sendEmail({
        event: `BILL_MATCHED:${bill.id}`,
        recipient,
        template: match.passed ? "bill-matched" : "bill-match-failed",
        email: renderMatchResultEmail({
          billNumber: bill.billNumber,
          poNumber: order.poNumber,
          orgName: order.org.name,
          vendorName: order.vendor.name,
          recipientEmail: recipient,
          passed: match.passed,
          checks: match.checks,
          orderedAmount: formatUsd(order.amountMinor),
          invoicedAmount: formatUsd(order.invoice!.invoicedAmountMinor),
          variance: match.variance?.formatted ?? "—",
          billUrl,
        }),
      });
    }

    // If the org has said the match is the authorisation, act like it.
    // Never allowed to throw — losing the match result because an RPC
    // call timed out would be the worst possible trade.
    const settled = match.passed ? await autoSettle(bill.id) : null;

    revalidatePath(`/o/${slug}/bills`);
    revalidatePath(`/o/${slug}/orders/${orderId}`);
    revalidatePath(`/o/${slug}/payments`);

    let tail = "";
    if (settled?.attempted && settled.ok) {
      tail = ` Settled automatically on Arc — ${settled.txHash.slice(0, 12)}…`;
    } else if (settled?.attempted && !settled.ok) {
      tail = ` Auto-settlement did not go through: ${settled.error}`;
    }

    return {
      ok: true,
      id: bill.id,
      billNumber: bill.billNumber,
      matched: match.passed,
      message: match.passed
        ? `${bill.billNumber} matched. Order, receipt and invoice agree — this is payable.${tail}`
        : `${bill.billNumber} failed the match: ${match.reason}. It cannot be paid until this is resolved.`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Re-run the match on an existing bill.
 *
 * A failed match is frequently resolved by changing the world rather
 * than the bill — the vendor is unblocked, a corrected invoice arrives.
 * Re-running appends a MatchResult rather than replacing one: the
 * history of why it failed and what changed is the audit trail, and
 * overwriting it would erase exactly the part worth keeping.
 */
export async function rematchBillAction(
  slug: string,
  billId: string,
): Promise<BillActionState> {
  try {
    const ctx = await canBill(slug);
    if (!ctx) return { ok: false, error: "Not permitted." };

    const bill = await db.bill.findUnique({
      where: { id: billId },
      include: { order: { include: ORDER_INCLUDE }, payment: true },
    });
    if (!bill || bill.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown bill." };
    }
    if (bill.payment) {
      return {
        ok: false,
        error: "This bill has already been paid — the match that released it stands.",
      };
    }

    const match = runThreeWayMatch(bill.order);

    await db.$transaction([
      db.matchResult.create({
        data: {
          billId: bill.id,
          outcome: match.passed ? MatchOutcomeEnum.PASS : MatchOutcomeEnum.FAIL,
          reason: match.reason,
          varianceMinor: match.variance?.deltaMinor ?? 0n,
          toleranceMinor: match.variance?.toleranceMinor ?? 0n,
        },
      }),
      db.bill.update({
        where: { id: bill.id },
        data: {
          status: match.passed ? BillStatus.MATCHED : BillStatus.MATCH_FAILED,
          invoicedAmountMinor:
            bill.order.invoice?.invoicedAmountMinor ?? bill.invoicedAmountMinor,
        },
      }),
    ]);

    revalidatePath(`/o/${slug}/bills`);
    revalidatePath(`/o/${slug}/bills/${billId}`);

    return {
      ok: true,
      id: bill.id,
      billNumber: bill.billNumber,
      matched: match.passed,
      message: match.passed
        ? `${bill.billNumber} now matches — it is payable.`
        : `Still failing: ${match.reason}`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
