/**
 * Unit discipline for Procure.
 *
 * Arc runs a hybrid decimal model:
 *   - Native gas accounting uses **18 decimals**. eth_getBalance,
 *     eth_gasPrice and all fee fields speak this representation.
 *   - The USDC ERC-20 interface exposes **6 decimals** for transfers and
 *     for anything a human reads.
 *
 * They share the same underlying balance but are NOT interchangeable.
 * Mixing them is a silent 10^12 error — which in a spend-management product
 * means the three-way match compares $12,000 against $0.000000012 and passes.
 *
 * So: every business amount is a `Usdc6`, an integer count of USDC base
 * units. Never a float. This is money; IEEE 754 has no business here.
 *
 * The branded types make mixing the two a *compile error*.
 */

declare const USDC6: unique symbol;
declare const NATIVE18: unique symbol;

/** Integer count of USDC base units (6 dp). All business amounts. */
export type Usdc6 = bigint & { readonly [USDC6]: true };

/** Integer in Arc's 18-decimal native gas accounting. Fees and gas only. */
export type Native18 = bigint & { readonly [NATIVE18]: true };

export const USDC_DECIMALS = 6;
export const NATIVE_DECIMALS = 18;

const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);
const NATIVE_SCALE = 10n ** BigInt(NATIVE_DECIMALS);
const NATIVE_TO_USDC = 10n ** BigInt(NATIVE_DECIMALS - USDC_DECIMALS);

/* ── constructors ────────────────────────────────────────────────────── */

/** Whole dollars -> Usdc6. `usd(12_000)` === $12,000.00 */
export function usd(wholeDollars: number | bigint): Usdc6 {
  return (BigInt(wholeDollars) * USDC_SCALE) as Usdc6;
}

/** Trust a bigint already in USDC base units (e.g. straight from the DB). */
export function asUsdc6(baseUnits: bigint): Usdc6 {
  return baseUnits as Usdc6;
}

/** Trust a bigint already in native 18-decimal units (e.g. from RPC). */
export function asNative18(value: bigint): Native18 {
  return value as Native18;
}

/**
 * Parse a human-entered amount ("12000", "12000.50", "$12,000.50").
 * Truncates beyond 6 dp rather than rounding — you do not silently round
 * money up in an AP system.
 */
export function parseUsd(input: string): Usdc6 {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new Error(`Not a valid amount: ${JSON.stringify(input)}`);
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const padded = fraction.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0");

  const magnitude = BigInt(whole || "0") * USDC_SCALE + BigInt(padded || "0");
  return (negative ? -magnitude : magnitude) as Usdc6;
}

/* ── formatting ──────────────────────────────────────────────────────── */

/** Usdc6 -> "12,000.50" (no symbol). */
export function formatAmount(value: Usdc6 | bigint): string {
  const v = value as bigint;
  const negative = v < 0n;
  const magnitude = negative ? -v : v;

  const whole = magnitude / USDC_SCALE;
  const fraction = magnitude % USDC_SCALE;

  // USDC has 6 dp but money is read in 2. Show 2 unless the extra
  // precision is non-zero, in which case hiding it would be a lie.
  const six = fraction.toString().padStart(USDC_DECIMALS, "0");
  const shown = /0{4}$/.test(six) ? six.slice(0, 2) : six;

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${shown}`;
}

/** Usdc6 -> "$12,000.50" */
export function formatUsd(value: Usdc6 | bigint): string {
  const v = value as bigint;
  const negative = v < 0n;
  return `${negative ? "-" : ""}$${formatAmount(negative ? -v : v)}`;
}

/* ── native <-> usdc ─────────────────────────────────────────────────── */

/**
 * 18-decimal native value (a gas cost) -> Usdc6 for display only.
 * Arc's docs recommend surfacing fees in dollar terms rather than gwei,
 * which is the only reason this crossing is ever legitimate.
 */
export function nativeToUsdcForDisplay(value: Native18 | bigint): Usdc6 {
  return ((value as bigint) / NATIVE_TO_USDC) as Usdc6;
}

/** Native18 -> "0.000441", full precision, for fee readouts. */
export function formatNative(value: Native18 | bigint): string {
  const v = value as bigint;
  const negative = v < 0n;
  const magnitude = negative ? -v : v;

  const whole = magnitude / NATIVE_SCALE;
  const fraction = (magnitude % NATIVE_SCALE)
    .toString()
    .padStart(NATIVE_DECIMALS, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/* ── arithmetic ──────────────────────────────────────────────────────── */

export function addUsd(...values: (Usdc6 | bigint)[]): Usdc6 {
  return values.reduce<bigint>((sum, v) => sum + (v as bigint), 0n) as Usdc6;
}

export function subUsd(a: Usdc6 | bigint, b: Usdc6 | bigint): Usdc6 {
  return ((a as bigint) - (b as bigint)) as Usdc6;
}

export function absUsd(value: Usdc6 | bigint): Usdc6 {
  const v = value as bigint;
  return (v < 0n ? -v : v) as Usdc6;
}

/**
 * Basis points of an amount, rounded down. Match tolerance:
 * `bps(poAmount, 100)` is a 1% band.
 */
export function bps(value: Usdc6 | bigint, basisPoints: number): Usdc6 {
  return (((value as bigint) * BigInt(basisPoints)) / 10_000n) as Usdc6;
}

/**
 * JSON.stringify throws on BigInt, and every money field is a BigInt.
 * Use this at any API boundary that serialises a Prisma row.
 */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}
