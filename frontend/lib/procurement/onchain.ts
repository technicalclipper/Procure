import { ApprovalMode } from "@prisma/client";
import { db } from "../db";
import {
  orgKey,
  poKey,
  matchHash,
  readRegistry,
  registryAddress,
  sendFromTreasury,
  type SentTx,
} from "../registry";

/**
 * Keeping the chain in step with the app.
 *
 * Every one of these is best-effort by design. A department whose
 * approvers didn't reach the chain is a department that can't pay, which
 * is the safe direction to fail in — but it must never stop someone
 * editing their settings, because then a bad RPC day locks the org out
 * of its own configuration. Failures are returned, surfaced, and
 * retryable; they are not thrown into the user's face mid-form.
 */

export type SyncResult =
  | { ok: true; tx: SentTx; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

async function treasury(orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { treasuryWalletId: true, treasuryAddress: true },
  });
  if (!org?.treasuryWalletId || !org.treasuryAddress) return null;
  return { walletId: org.treasuryWalletId, address: org.treasuryAddress };
}

/** How many distinct signatures a level demands, in the contract's terms. */
export function requiredFor(
  mode: ApprovalMode,
  quorumCount: number,
  approverCount: number,
): number {
  if (mode === ApprovalMode.ALL) return approverCount;
  if (mode === ApprovalMode.QUORUM) return Math.min(quorumCount, approverCount);
  return 1;
}

/**
 * Push a level's approver set on-chain.
 *
 * Called after the set is saved, so the database is the intent and the
 * chain is the enforcement. If this fails the level simply cannot
 * authorise a payment yet, and the settings page says so.
 */
export async function syncApprovers(
  orgId: string,
  levelId: string,
): Promise<SyncResult> {
  try {
    if (!registryAddress()) {
      return { ok: true, skipped: true, reason: "No registry configured" };
    }
    const t = await treasury(orgId);
    if (!t) return { ok: true, skipped: true, reason: "Org has no treasury wallet" };

    const level = await db.approvalLevel.findUnique({
      where: { id: levelId },
      include: { approvers: { include: { user: { select: { walletAddress: true } } } } },
    });
    if (!level) return { ok: false, error: "Unknown level" };

    const addresses = level.approvers
      .map((a) => a.user.walletAddress)
      .filter((a): a is string => !!a);

    if (addresses.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "No approver on this level has a wallet yet",
      };
    }

    const required = requiredFor(
      level.mode,
      level.quorumCount,
      addresses.length,
    );

    const tx = await sendFromTreasury(t.walletId, t.address, "setApprovers", [
      orgKey(orgId),
      level.position,
      addresses,
      required,
    ]);
    return { ok: true, tx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Allow or disallow a vendor's payout address.
 *
 * This is where the risk screening stops being advice. A blocked vendor
 * is removed from the on-chain allowlist, and from then on the contract
 * refuses to pay it regardless of what our database thinks.
 */
export async function syncVendor(
  orgId: string,
  vendorId: string,
): Promise<SyncResult> {
  try {
    if (!registryAddress()) {
      return { ok: true, skipped: true, reason: "No registry configured" };
    }
    const t = await treasury(orgId);
    if (!t) return { ok: true, skipped: true, reason: "Org has no treasury wallet" };

    const v = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { payoutAddress: true, status: true },
    });
    if (!v) return { ok: false, error: "Unknown vendor" };

    const allowed = v.status === "ACTIVE";
    const current = await readRegistry<boolean>("vendorAllowed", [
      orgKey(orgId),
      v.payoutAddress,
    ]);
    if (current === allowed) {
      return { ok: true, skipped: true, reason: "Already in that state on-chain" };
    }

    const tx = await sendFromTreasury(
      t.walletId,
      t.address,
      "setVendorAllowed",
      [orgKey(orgId), v.payoutAddress, allowed],
    );
    return { ok: true, tx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Total allocated across departments — the ceiling the contract holds. */
export async function syncBudget(orgId: string): Promise<SyncResult> {
  try {
    if (!registryAddress()) {
      return { ok: true, skipped: true, reason: "No registry configured" };
    }
    const t = await treasury(orgId);
    if (!t) return { ok: true, skipped: true, reason: "Org has no treasury wallet" };

    const depts = await db.department.findMany({
      where: { orgId },
      select: { budgetMinor: true },
    });
    const total = depts.reduce((s, d) => s + d.budgetMinor, 0n);

    const tx = await sendFromTreasury(t.walletId, t.address, "setBudget", [
      orgKey(orgId),
      total,
    ]);
    return { ok: true, tx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fix an order's terms on-chain at issue time.
 *
 * Before anyone approves, so the signature covers terms that were
 * already committed. Approving one thing and paying another isn't
 * caught afterwards — it's arithmetically impossible, because the
 * amount lives inside the signed digest and is read back from here.
 */
export async function commitOrderOnchain(
  orgId: string,
  orderId: string,
): Promise<SyncResult> {
  try {
    if (!registryAddress()) {
      return { ok: true, skipped: true, reason: "No registry configured" };
    }
    const t = await treasury(orgId);
    if (!t) return { ok: true, skipped: true, reason: "Org has no treasury wallet" };

    const order = await db.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        vendor: { select: { payoutAddress: true } },
        receipt: { select: { grnNumber: true } },
        invoice: {
          select: { vendorInvoiceNumber: true, invoicedAmountMinor: true },
        },
      },
    });
    if (!order) return { ok: false, error: "Unknown order" };

    // Keyed by the REQUEST, not the order. Approvers sign before the
    // order exists, so the key they signed has to be the key the order
    // is committed under — otherwise every signature is for a poHash the
    // contract has never heard of and no payment can ever verify.
    const key = poKey(order.requestId);

    // At issue time there is no receipt or invoice yet, so the hash
    // commits to the order alone and is recomputed when the bill is
    // matched. It's evidence of what was agreed, not proof of delivery.
    const mh = matchHash({
      poNumber: order.poNumber,
      grnNumber: order.receipt?.grnNumber ?? "",
      invoiceNumber: order.invoice?.vendorInvoiceNumber ?? "",
      invoicedMinor: order.invoice?.invoicedAmountMinor ?? 0n,
    });

    const tx = await sendFromTreasury(t.walletId, t.address, "commitOrder", [
      orgKey(orgId),
      key,
      order.vendor.payoutAddress,
      order.amountMinor,
      mh,
    ]);

    await db.purchaseOrder.update({
      where: { id: orderId },
      data: { onchainTxHash: tx.hash, onchainPoId: key },
    });

    return { ok: true, tx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** What the chain currently believes about a level, for the settings UI. */
export async function readApproverState(orgId: string, position: number) {
  if (!registryAddress()) return null;
  try {
    const required = await readRegistry<number>("threshold", [
      orgKey(orgId),
      position,
    ]);
    return { required: Number(required) };
  } catch {
    return null;
  }
}
