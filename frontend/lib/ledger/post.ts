import { db } from "../db";

/**
 * Double-entry posting.
 *
 * Three events move the books, and the middle account is the point:
 *
 *   goods received   Dr Expense          Cr GR/IR clearing
 *   invoice booked   Dr GR/IR clearing   Cr Accounts payable
 *   payment sent     Dr Accounts payable Cr Cash (USDC)
 *
 * GR/IR clears to zero only when what arrived and what was invoiced
 * agree. So a non-zero GR/IR balance *is* the match exception report —
 * not a screen someone has to remember to open, but a number that will
 * not go away until somebody resolves it. That is why the account is
 * seeded with every new organisation.
 *
 * Nothing here reverses or amends. A ledger you can edit is a ledger
 * nobody can rely on; corrections are posted as further entries.
 */

const EXPENSE_FALLBACK = "5000";
const GRIR = "2100";
const PAYABLES = "2000";
const CASH = "1000";

export type PostResult =
  | { ok: true; entryId: string; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

async function accountId(orgId: string, code: string): Promise<string | null> {
  const a = await db.account.findUnique({
    where: { orgId_code: { orgId, code } },
    select: { id: true },
  });
  return a?.id ?? null;
}

/** Already posted? Source type and id make each event idempotent. */
async function existing(sourceType: string, sourceId: string) {
  return db.journalEntry.findFirst({
    where: { sourceType, sourceId },
    select: { id: true },
  });
}

async function post(params: {
  orgId: string;
  sourceType: string;
  sourceId: string;
  memo: string;
  txHash?: string | null;
  lines: { code: string; debitMinor?: bigint; creditMinor?: bigint }[];
}): Promise<PostResult> {
  const already = await existing(params.sourceType, params.sourceId);
  if (already) {
    return { ok: true, skipped: true, reason: "Already posted" };
  }

  const resolved: {
    accountId: string;
    debitMinor: bigint;
    creditMinor: bigint;
  }[] = [];

  for (const l of params.lines) {
    const id = await accountId(params.orgId, l.code);
    if (!id) {
      return {
        ok: false,
        error: `Account ${l.code} is missing from the chart of accounts.`,
      };
    }
    resolved.push({
      accountId: id,
      debitMinor: l.debitMinor ?? 0n,
      creditMinor: l.creditMinor ?? 0n,
    });
  }

  // Refuse to write an unbalanced entry. A ledger that can hold one is
  // not a ledger, and the failure would surface days later in a trial
  // balance nobody could reconcile.
  const dr = resolved.reduce((s, l) => s + l.debitMinor, 0n);
  const cr = resolved.reduce((s, l) => s + l.creditMinor, 0n);
  if (dr !== cr) {
    return {
      ok: false,
      error: `Entry does not balance: debits ${dr}, credits ${cr}.`,
    };
  }
  if (dr === 0n) {
    return { ok: true, skipped: true, reason: "Nothing to post" };
  }

  const entry = await db.journalEntry.create({
    data: {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      memo: params.memo,
      txHash: params.txHash ?? null,
      lines: { create: resolved },
    },
  });

  return { ok: true, entryId: entry.id };
}

/**
 * Goods received — the liability exists from here, before any invoice.
 *
 * Booked at the ordered value, because that is what was agreed and the
 * receipt carries no price of its own. When the invoice lands at a
 * different figure, the difference stays visible in GR/IR.
 */
export async function postGoodsReceipt(receiptId: string): Promise<PostResult> {
  try {
    const grn = await db.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: {
        order: {
          include: {
            request: { include: { lines: true } },
            department: { select: { name: true } },
            vendor: { select: { name: true } },
          },
        },
      },
    });
    if (!grn) return { ok: false, error: "Unknown receipt." };

    // Each line to its own expense account, so the P&L is coded the way
    // the requester coded it rather than lumped into one bucket.
    const byAccount = new Map<string, bigint>();
    for (const l of grn.order.request.lines) {
      const code = l.expenseAccountCode ?? EXPENSE_FALLBACK;
      byAccount.set(code, (byAccount.get(code) ?? 0n) + l.amountMinor);
    }
    if (byAccount.size === 0) {
      byAccount.set(EXPENSE_FALLBACK, grn.order.amountMinor);
    }

    const lines = [
      ...Array.from(byAccount, ([code, amount]) => ({
        code,
        debitMinor: amount,
      })),
      { code: GRIR, creditMinor: grn.order.amountMinor },
    ];

    return post({
      orgId: grn.orgId,
      sourceType: "GOODS_RECEIPT",
      sourceId: grn.id,
      memo: `${grn.grnNumber} — ${grn.order.vendor.name} against ${grn.order.poNumber}`,
      lines,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bill matched — the obligation becomes a payable to a named vendor.
 *
 * Posted at the invoiced amount while GR/IR was credited at the ordered
 * amount, so any variance lands in GR/IR and stays there. That residue
 * is the whole point: it is the difference between what arrived and
 * what was billed, in the ledger, where it cannot be dismissed.
 */
export async function postBill(billId: string): Promise<PostResult> {
  try {
    const bill = await db.bill.findUnique({
      where: { id: billId },
      include: {
        order: {
          select: {
            poNumber: true,
            amountMinor: true,
            vendor: { select: { name: true } },
          },
        },
      },
    });
    if (!bill) return { ok: false, error: "Unknown bill." };

    return post({
      orgId: bill.orgId,
      sourceType: "BILL",
      sourceId: bill.id,
      memo: `${bill.billNumber} — ${bill.order.vendor.name} invoice against ${bill.order.poNumber}`,
      lines: [
        { code: GRIR, debitMinor: bill.order.amountMinor },
        { code: PAYABLES, creditMinor: bill.invoicedAmountMinor },
        // Any difference between ordered and invoiced sits in GR/IR as
        // its balancing residue — post it explicitly so the entry
        // balances rather than silently dropping the remainder.
        ...(bill.invoicedAmountMinor !== bill.order.amountMinor
          ? [
              bill.invoicedAmountMinor > bill.order.amountMinor
                ? {
                    code: GRIR,
                    debitMinor:
                      bill.invoicedAmountMinor - bill.order.amountMinor,
                  }
                : {
                    code: GRIR,
                    creditMinor:
                      bill.order.amountMinor - bill.invoicedAmountMinor,
                  },
            ]
          : []),
      ],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Payment settled — carries the Arc transaction hash.
 *
 * Reconciliation is then a join rather than an exercise: the journal
 * entry and the chain agree because they reference the same hash.
 */
export async function postPayment(paymentId: string): Promise<PostResult> {
  try {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        bill: {
          include: {
            order: { select: { poNumber: true, vendor: { select: { name: true } } } },
          },
        },
      },
    });
    if (!payment) return { ok: false, error: "Unknown payment." };
    if (!payment.txHash) {
      return { ok: true, skipped: true, reason: "Not settled on chain yet" };
    }

    return post({
      orgId: payment.bill.orgId,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      txHash: payment.txHash,
      memo: `${payment.bill.billNumber} paid — ${payment.bill.order.vendor.name}`,
      lines: [
        { code: PAYABLES, debitMinor: payment.amountMinor },
        { code: CASH, creditMinor: payment.amountMinor },
      ],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── reporting ─────────────────────────────────────────────────────── */

export type TrialRow = {
  code: string;
  name: string;
  type: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
};

/**
 * Trial balance. Debits must equal credits — if they don't, something
 * wrote an unbalanced entry and the page says so rather than rendering
 * a total that looks fine.
 */
export async function trialBalance(orgId: string): Promise<{
  rows: TrialRow[];
  totalDebit: bigint;
  totalCredit: bigint;
  balanced: boolean;
  grirMinor: bigint;
}> {
  const accounts = await db.account.findMany({
    where: { orgId },
    include: { journalLines: true },
    orderBy: { code: "asc" },
  });

  const rows: TrialRow[] = accounts
    .map((a) => {
      const debitMinor = a.journalLines.reduce((s, l) => s + l.debitMinor, 0n);
      const creditMinor = a.journalLines.reduce((s, l) => s + l.creditMinor, 0n);
      return {
        code: a.code,
        name: a.name,
        type: a.type,
        debitMinor,
        creditMinor,
        // Assets and expenses are debit-natural; the rest credit-natural.
        balanceMinor:
          a.type === "ASSET" || a.type === "EXPENSE"
            ? debitMinor - creditMinor
            : creditMinor - debitMinor,
      };
    })
    .filter((r) => r.debitMinor !== 0n || r.creditMinor !== 0n);

  const totalDebit = rows.reduce((s, r) => s + r.debitMinor, 0n);
  const totalCredit = rows.reduce((s, r) => s + r.creditMinor, 0n);
  const grir = rows.find((r) => r.code === GRIR);

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    grirMinor: grir?.balanceMinor ?? 0n,
  };
}
