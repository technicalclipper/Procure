import { POStatus, VendorStatus } from "@prisma/client";
import { formatUsd, type Usdc6 } from "../units";
import { computeVariance, type Variance } from "./match";

/**
 * The three-way match.
 *
 * Order, receipt, invoice. Three documents from three parties at three
 * different times, and none able to produce the others — that separation
 * is the control. A bill assembled from the purchase order alone would
 * agree with itself by construction, which is why Bill carries both the
 * ordered and the invoiced figure rather than one derived from the other.
 *
 * Every check runs even after one fails. "Invoice is $200 over AND the
 * vendor was blocked since you ordered" is a different conversation from
 * either fact alone, and stopping at the first failure hides the second.
 */

export type CheckId =
  | "order_live"
  | "goods_received"
  | "invoice_received"
  | "vendor_payable"
  | "amount_within_tolerance";

export type Check = {
  id: CheckId;
  label: string;
  passed: boolean;
  /// What was compared, stated so a human can audit the decision.
  detail: string;
};

export type MatchInput = {
  status: POStatus;
  poNumber: string;
  amountMinor: bigint;
  toleranceBps: number;
  vendor: { name: string; status: VendorStatus };
  receipt: { grnNumber: string; createdAt: Date } | null;
  invoice: { vendorInvoiceNumber: string; invoicedAmountMinor: bigint } | null;
};

export type MatchOutcome = {
  passed: boolean;
  checks: Check[];
  /// Null when there is no invoice to compare against yet.
  variance: Variance | null;
  /// One line, suitable for MatchResult.reason and for an email subject.
  reason: string;
};

export function runThreeWayMatch(order: MatchInput): MatchOutcome {
  const checks: Check[] = [];

  const live =
    order.status !== POStatus.CANCELLED &&
    order.status !== POStatus.VENDOR_REJECTED;
  checks.push({
    id: "order_live",
    label: "Purchase order is live",
    passed: live,
    detail: live
      ? `${order.poNumber} for ${formatUsd(order.amountMinor)}`
      : `${order.poNumber} is ${order.status.toLowerCase().replace("vendor_", "").replace("_", " ")}`,
  });

  checks.push({
    id: "goods_received",
    label: "Goods receipted",
    passed: !!order.receipt,
    detail: order.receipt
      ? `${order.receipt.grnNumber} on ${order.receipt.createdAt.toLocaleDateString("en-GB")}`
      : "Nobody has confirmed anything arrived",
  });

  checks.push({
    id: "invoice_received",
    label: "Vendor invoice received",
    passed: !!order.invoice,
    detail: order.invoice
      ? `${order.invoice.vendorInvoiceNumber} for ${formatUsd(order.invoice.invoicedAmountMinor)}`
      : "The vendor has not invoiced",
  });

  // Screened at order time, but a vendor can be blocked afterwards — and
  // the payment is the moment that has to be true, not the order.
  const payable = order.vendor.status === VendorStatus.ACTIVE;
  checks.push({
    id: "vendor_payable",
    label: "Vendor is payable",
    passed: payable,
    detail: payable
      ? `${order.vendor.name} is active`
      : `${order.vendor.name} is ${order.vendor.status.toLowerCase()} — it was active when this was ordered`,
  });

  const variance = order.invoice
    ? computeVariance(
        order.amountMinor,
        order.invoice.invoicedAmountMinor,
        order.toleranceBps,
      )
    : null;

  checks.push({
    id: "amount_within_tolerance",
    label: "Invoiced amount agrees with the order",
    passed: variance?.withinTolerance ?? false,
    detail: variance
      ? `Ordered ${formatUsd(order.amountMinor)}, invoiced ${formatUsd(order.invoice!.invoicedAmountMinor)} — ${variance.formatted} against a ${variance.tolerancePercent} tolerance of ${formatUsd(variance.toleranceMinor as Usdc6)}`
      : "No invoice to compare",
  });

  const failed = checks.filter((c) => !c.passed);

  return {
    passed: failed.length === 0,
    checks,
    variance,
    reason: failed.length === 0
      ? `All three agree — ordered ${formatUsd(order.amountMinor)}, received ${order.receipt!.grnNumber}, invoiced ${formatUsd(order.invoice!.invoicedAmountMinor)}`
      : failed.map((c) => c.detail).join("; "),
  };
}
