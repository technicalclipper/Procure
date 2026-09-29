import { formatUsd, type Usdc6 } from "../units";

/**
 * The comparison at the centre of the product.
 *
 * Three numbers have to agree before money moves: what was ordered, what
 * was received, and what was invoiced. Quantities are carried by the
 * order lines and the receipt confirms them wholesale, so in value terms
 * the test reduces to ordered vs invoiced within a tolerance.
 *
 * Tolerance exists because real invoices carry rounding, freight and
 * small fluctuations, and a match that fails on a two-cent difference
 * gets switched off inside a week. It is expressed in basis points so
 * it scales with the order rather than being a flat cash amount that is
 * generous on a $500 order and meaningless on a $500,000 one.
 */

export type Variance = {
  /// invoiced − ordered. Positive means the vendor billed more.
  deltaMinor: bigint;
  /// Absolute value, what the tolerance is tested against.
  absMinor: bigint;
  toleranceMinor: bigint;
  withinTolerance: boolean;
  /// Signed and formatted: "+$120.00", "−$5.00", "$0.00"
  formatted: string;
  /// "1.00%"
  tolerancePercent: string;
};

/**
 * Tolerance is taken from the order, not from current configuration.
 * The bar an order was issued under is the bar it clears — otherwise
 * lowering the org's tolerance would retroactively break invoices that
 * were fine when they arrived.
 */
export function computeVariance(
  orderedMinor: bigint,
  invoicedMinor: bigint,
  toleranceBps: number,
): Variance {
  const deltaMinor = invoicedMinor - orderedMinor;
  const absMinor = deltaMinor < 0n ? -deltaMinor : deltaMinor;

  // Rounded down: a variance sitting exactly on the boundary passes,
  // and the tolerance can never be quietly wider than configured.
  const toleranceMinor = (orderedMinor * BigInt(toleranceBps)) / 10_000n;

  const sign = deltaMinor > 0n ? "+" : deltaMinor < 0n ? "−" : "";

  return {
    deltaMinor,
    absMinor,
    toleranceMinor,
    withinTolerance: absMinor <= toleranceMinor,
    formatted: `${sign}${formatUsd(absMinor as Usdc6)}`,
    tolerancePercent: `${(toleranceBps / 100).toFixed(2)}%`,
  };
}
