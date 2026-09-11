import { POStatus, PRStatus, RiskBand, VendorStatus } from "@prisma/client";
import { db } from "../db";
import { type Usdc6, asUsdc6, formatUsd } from "../units";

/**
 * Pre-checks run before a purchase request can be submitted.
 *
 * These are the cheap controls — they catch the mistake at the point
 * someone makes it, rather than after an approver has already signed off
 * on something that could never have been paid.
 */

export type CheckResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type BudgetPosition = {
  allocated: bigint;
  /** Committed by issued POs but not yet paid. */
  encumbered: bigint;
  spent: bigint;
  available: bigint;
};

/**
 * Available = allocation − spent − encumbered.
 *
 * Without the encumbered term, five separate $12k requests against a $50k
 * budget each pass individually — nothing has been *paid* yet — and you
 * end $10k over with five valid orders and no money. Approval commits
 * budget; payment merely settles it.
 */
export async function budgetPosition(
  departmentId: string,
): Promise<BudgetPosition> {
  const dept = await db.department.findUniqueOrThrow({
    where: { id: departmentId },
    select: { budgetMinor: true },
  });

  const open = await db.purchaseOrder.findMany({
    where: {
      departmentId,
      status: { notIn: [POStatus.CANCELLED, POStatus.VENDOR_REJECTED] },
    },
    select: { amountMinor: true, bill: { select: { payment: true } } },
  });

  let encumbered = 0n;
  let spent = 0n;
  for (const po of open) {
    if (po.bill?.payment?.status === "CONFIRMED") spent += po.amountMinor;
    else encumbered += po.amountMinor;
  }

  const allocated = dept.budgetMinor;
  return {
    allocated,
    encumbered,
    spent,
    available: allocated - spent - encumbered,
  };
}

export async function runPreChecks(input: {
  orgId: string;
  departmentId: string;
  vendorId: string;
  amountMinor: Usdc6 | bigint;
}): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const [vendor, dept, approvers] = await Promise.all([
    db.vendor.findUnique({ where: { id: input.vendorId } }),
    db.department.findUnique({ where: { id: input.departmentId } }),
    db.membership.count({
      where: { departmentId: input.departmentId, role: "APPROVER" },
    }),
  ]);

  // Vendor is payable
  if (!vendor || vendor.orgId !== input.orgId) {
    checks.push({
      key: "vendor",
      label: "Vendor",
      passed: false,
      detail: "Unknown vendor.",
    });
  } else if (vendor.status === VendorStatus.BLOCKED) {
    checks.push({
      key: "vendor",
      label: "Vendor is payable",
      passed: false,
      detail: `${vendor.name} is blocked and cannot be paid.`,
    });
  } else if (vendor.status !== VendorStatus.ACTIVE) {
    checks.push({
      key: "vendor",
      label: "Vendor is payable",
      passed: false,
      detail: `${vendor.name} is still a draft — screen the payout address and activate it first.`,
    });
  } else if (vendor.riskBand === RiskBand.UNSCREENED) {
    checks.push({
      key: "vendor",
      label: "Vendor is payable",
      passed: false,
      detail: `${vendor.name}'s payout address has not been screened.`,
    });
  } else {
    checks.push({
      key: "vendor",
      label: "Vendor is payable",
      passed: true,
      detail: `${vendor.name} is active and screened (${vendor.riskBand.toLowerCase()}).`,
    });
  }

  // Department can actually pay
  if (!dept || dept.orgId !== input.orgId) {
    checks.push({
      key: "department",
      label: "Department",
      passed: false,
      detail: "Unknown department.",
    });
  } else if (!dept.walletId) {
    checks.push({
      key: "department",
      label: "Department wallet",
      passed: false,
      detail: `${dept.name} has no wallet, so nothing can be paid from it.`,
    });
  } else {
    checks.push({
      key: "department",
      label: "Department wallet",
      passed: true,
      detail: `${dept.name} is provisioned.`,
    });
  }

  // Budget, including what is already committed
  if (dept) {
    const pos = await budgetPosition(input.departmentId);
    const amount = asUsdc6(BigInt(input.amountMinor));
    const ok = pos.available >= amount;
    checks.push({
      key: "budget",
      label: "Budget available",
      passed: ok,
      detail: ok
        ? `${formatUsd(pos.available)} available of ${formatUsd(pos.allocated)} — ${formatUsd(pos.encumbered)} already committed.`
        : `Needs ${formatUsd(amount)} but only ${formatUsd(pos.available)} is uncommitted (${formatUsd(pos.encumbered)} is already on open orders).`,
    });
  }

  // Someone can actually approve it
  checks.push({
    key: "approvers",
    label: "Approver cover",
    passed: approvers > 0,
    detail:
      approvers > 0
        ? `${approvers} approver${approvers === 1 ? "" : "s"} in this department.`
        : "No approvers in this department — a request raised here could never be approved.",
  });

  return checks;
}

/**
 * How many approvals this request needs, snapshotted at submit time.
 *
 * Snapshotting matters: if a controller changes the thresholds while a
 * request is in flight, the bar it was submitted under is the bar it
 * should clear. Otherwise the audit trail cannot be reconstructed.
 */
export function approvalsRequiredFor(amountMinor: bigint): number {
  const auto = BigInt(process.env.APPROVAL_AUTO_BELOW ?? 1000) * 1_000_000n;
  const quorumAbove =
    BigInt(process.env.APPROVAL_QUORUM_ABOVE ?? 10_000) * 1_000_000n;
  const quorum = Number(process.env.APPROVAL_QUORUM_REQUIRED ?? 2);

  if (amountMinor < auto) return 0;
  if (amountMinor < quorumAbove) return 1;
  return quorum;
}

export function routingSummary(amountMinor: bigint): string {
  const n = approvalsRequiredFor(amountMinor);
  if (n === 0) return "Under the approval threshold — approved automatically.";
  if (n === 1) return "Needs one approval.";
  return `Needs ${n} approvals.`;
}

export const OPEN_PR_STATUSES = [
  PRStatus.SUBMITTED,
  PRStatus.PENDING_APPROVAL,
] as const;
