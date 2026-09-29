import { db } from "../db";

/**
 * Human-readable document numbers, per organisation.
 *
 * PR-0001, PO-0001, GRN-0001, BILL-0001 — a procurement team refers to
 * these out loud, so they have to be short and sequential rather than a
 * cuid. Numbers restart per org because they are scoped by a composite
 * unique index.
 */

function format(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Next number for an org.
 *
 * Counting and incrementing races under concurrency, so the caller
 * retries on a unique-constraint violation. That is cheaper and simpler
 * than a counter table, and collisions are vanishingly rare at the rate
 * humans raise purchase requests.
 */
export async function nextPrNumber(orgId: string): Promise<string> {
  const n = await db.purchaseRequest.count({ where: { orgId } });
  return format("PR", n + 1);
}

export async function nextPoNumber(orgId: string): Promise<string> {
  const n = await db.purchaseOrder.count({ where: { orgId } });
  return format("PO", n + 1);
}

export async function nextGrnNumber(orgId: string): Promise<string> {
  const n = await db.goodsReceipt.count({ where: { orgId } });
  return format("GRN", n + 1);
}

export async function nextBillNumber(orgId: string): Promise<string> {
  const n = await db.bill.count({ where: { orgId } });
  return format("BILL", n + 1);
}

/**
 * Run a create that assigns a generated number, retrying if another
 * request took the same one first.
 */
export async function withNumberRetry<T>(
  make: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await make();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "P2002") throw e;
      lastError = e;
    }
  }
  throw lastError;
}
