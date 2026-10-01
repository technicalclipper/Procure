import { db } from "../db";
import { payBill } from "./payment";
import { syncApprovers, syncVendor, commitOrderOnchain } from "./onchain";

/**
 * Automation.
 *
 * The design claim is that a passing three-way match plus enough
 * approver signatures *is* the authorisation. If that's true, a person
 * pressing Pay afterwards is a fourth approval nobody designed — they
 * are not deciding anything, because the contract will refuse anything
 * they could wrongly approve.
 *
 * So this grants no new power. Every signature, the allowlist and the
 * budget are still verified on chain, and a bad payment still reverts.
 * What it removes is the last human step that wasn't doing any work.
 *
 * Off by default all the same. Turning it on is a statement an
 * organisation should make deliberately, and every run is recorded —
 * an automation you cannot audit is one nobody will trust with money.
 */

async function record(
  orgId: string,
  kind: string,
  subjectId: string,
  succeeded: boolean,
  detail: string,
  txHash?: string,
) {
  await db.automationRun.create({
    data: { orgId, kind, subjectId, succeeded, detail, txHash: txHash ?? null },
  });
}

export type AutoSettleOutcome =
  | { attempted: false; reason: string }
  | { attempted: true; ok: true; txHash: string }
  | { attempted: true; ok: false; error: string };

/**
 * Settle a bill the moment it matches, if the org has asked for it.
 *
 * Never throws. A failure here must not unwind the bill that was just
 * raised — the match result is a fact regardless of whether payment
 * went through, and losing it because an RPC call timed out would be
 * the worst possible trade.
 */
export async function autoSettle(billId: string): Promise<AutoSettleOutcome> {
  try {
    const bill = await db.bill.findUnique({
      where: { id: billId },
      select: {
        orgId: true,
        billNumber: true,
        org: { select: { autoSettle: true } },
      },
    });
    if (!bill) return { attempted: false, reason: "Unknown bill" };
    if (!bill.org.autoSettle) {
      return { attempted: false, reason: "Auto-settlement is off for this organisation" };
    }

    const result = await payBill(billId);

    if (result.ok) {
      await record(
        bill.orgId,
        "AUTO_SETTLE",
        billId,
        true,
        `${bill.billNumber} settled automatically on match`,
        result.txHash,
      );
      return { attempted: true, ok: true, txHash: result.txHash };
    }

    await record(
      bill.orgId,
      "AUTO_SETTLE",
      billId,
      false,
      `${bill.billNumber} not settled: ${result.error}`,
    );
    return { attempted: true, ok: false, error: result.error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      const b = await db.bill.findUnique({
        where: { id: billId },
        select: { orgId: true },
      });
      if (b) await record(b.orgId, "AUTO_SETTLE", billId, false, error);
    } catch {
      // The audit write failing must not mask the original failure.
    }
    return { attempted: true, ok: false, error };
  }
}

export type RetryReport = {
  attempted: number;
  succeeded: number;
  failures: string[];
};

/**
 * Re-push anything the chain missed.
 *
 * On-chain syncs are best-effort by design — a bad RPC day must never
 * stop someone editing their own settings. The cost of that choice is
 * drift, and this is how it's paid back: without it, the fix is
 * re-saving a form and hoping you remember which one.
 */
export async function retryChainSync(orgId: string): Promise<RetryReport> {
  const report: RetryReport = { attempted: 0, succeeded: 0, failures: [] };

  const levels = await db.approvalLevel.findMany({
    where: { flow: { orgId, enabled: true }, approvers: { some: {} } },
    select: { id: true, position: true },
  });
  for (const l of levels) {
    report.attempted++;
    const r = await syncApprovers(orgId, l.id);
    if (r.ok && !r.skipped) report.succeeded++;
    else if (!r.ok) report.failures.push(`Level ${l.position}: ${r.error}`);
  }

  const vendors = await db.vendor.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  for (const v of vendors) {
    report.attempted++;
    const r = await syncVendor(orgId, v.id);
    if (r.ok && !r.skipped) report.succeeded++;
    else if (!r.ok) report.failures.push(`${v.name}: ${r.error}`);
  }

  // Orders that never made it on chain cannot be paid — the contract
  // has nothing to pay against — so these are the most important.
  const orders = await db.purchaseOrder.findMany({
    where: { orgId, onchainTxHash: null, status: { notIn: ["CANCELLED", "VENDOR_REJECTED"] } },
    select: { id: true, poNumber: true },
  });
  for (const o of orders) {
    report.attempted++;
    const r = await commitOrderOnchain(orgId, o.id);
    if (r.ok && !r.skipped) report.succeeded++;
    else if (!r.ok) report.failures.push(`${o.poNumber}: ${r.error}`);
  }

  await record(
    orgId,
    "SYNC_RETRY",
    orgId,
    report.failures.length === 0,
    `${report.succeeded} of ${report.attempted} pushed; ${report.failures.length} failed`,
  );

  return report;
}
