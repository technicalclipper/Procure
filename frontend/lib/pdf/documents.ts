import { Doc, textWidth } from "./build";
import { formatUsd } from "../units";

/**
 * The five documents a procurement cycle produces.
 *
 * Deliberately plain. These are records someone files, attaches to a
 * dispute or hands to an auditor — so every one carries the numbers it
 * is about and the documents it depends on, and none of them carries
 * decoration that would survive a photocopier badly.
 */

const SLATE: [number, number, number] = [0.39, 0.45, 0.55];
const MUTED: [number, number, number] = [0.58, 0.64, 0.72];
const INK: [number, number, number] = [0.06, 0.09, 0.16];
const INDIGO: [number, number, number] = [0.31, 0.27, 0.9];
const GOOD: [number, number, number] = [0.02, 0.47, 0.34];
const BAD: [number, number, number] = [0.72, 0.11, 0.11];

function header(
  doc: Doc,
  kind: string,
  number: string,
  orgName: string,
  meta: string[],
) {
  doc.text("PROCURE", { size: 9, font: "Helvetica-Bold", color: INDIGO });
  doc.text(orgName, { size: 9, color: MUTED, align: "right" });
  doc.gap(18);

  doc.line(kind.toUpperCase(), { size: 8, font: "Helvetica-Bold", color: SLATE });
  doc.gap(2);
  doc.line(number, { size: 22, font: "Helvetica-Bold", color: INK });
  doc.gap(4);
  for (const m of meta) doc.line(m, { size: 9, color: SLATE });
  doc.gap(10);
  doc.rule();
  doc.gap(14);
}

function field(doc: Doc, label: string, value: string) {
  doc.text(label, { size: 8, color: MUTED });
  doc.gap(11);
  doc.line(value, { size: 10, color: INK });
  doc.gap(6);
}

function twoUp(
  doc: Doc,
  left: { label: string; value: string },
  right: { label: string; value: string },
) {
  const mid = doc.left + doc.contentWidth / 2;
  const top = doc.y;
  doc.text(left.label, { size: 8, color: MUTED });
  doc.text(right.label, { size: 8, color: MUTED, x: mid });
  doc.y = top + 11;
  doc.text(left.value, { size: 10, color: INK });
  doc.text(right.value, { size: 10, color: INK, x: mid });
  doc.y = top + 26;
}

/** Right-aligned money column, with the label on the left. */
function total(doc: Doc, label: string, amount: string, bold = false) {
  const font = bold ? ("Helvetica-Bold" as const) : ("Helvetica" as const);
  const top = doc.y;
  doc.text(label, { size: bold ? 11 : 10, font, color: bold ? INK : SLATE });
  doc.text(amount, { size: bold ? 12 : 10, font, color: INK, align: "right" });
  doc.y = top + (bold ? 18 : 15);
}

export type LineItem = {
  description: string;
  quantity: number;
  unitRateMinor: bigint;
  amountMinor: bigint;
  code?: string | null;
};

function lineTable(doc: Doc, lines: LineItem[], totalMinor: bigint) {
  const cols = {
    desc: doc.left,
    qty: doc.left + doc.contentWidth * 0.58,
    unit: doc.left + doc.contentWidth * 0.72,
    amount: doc.right,
  };

  doc.box(18, { fill: [0.97, 0.98, 0.99] });
  doc.y += 5;
  doc.text("DESCRIPTION", { size: 7.5, font: "Helvetica-Bold", color: MUTED, x: cols.desc + 6 });
  doc.text("QTY", { size: 7.5, font: "Helvetica-Bold", color: MUTED, x: cols.qty, align: "right" });
  doc.text("UNIT", { size: 7.5, font: "Helvetica-Bold", color: MUTED, x: cols.unit, align: "right" });
  doc.text("AMOUNT", { size: 7.5, font: "Helvetica-Bold", color: MUTED, x: cols.amount - 6, align: "right" });
  doc.y += 15;

  for (const l of lines) {
    doc.ensure(26);
    const top = doc.y;
    // Truncate rather than wrap: a description long enough to wrap
    // pushes the money column out of alignment, and these read as
    // tables first and prose second.
    let desc = l.description;
    const maxW = cols.qty - cols.desc - 20;
    while (textWidth(desc, 9.5) > maxW && desc.length > 4) {
      desc = desc.slice(0, -2);
    }
    if (desc !== l.description) desc = desc.slice(0, -1) + "…";

    doc.text(desc, { size: 9.5, color: INK, x: cols.desc + 6 });
    doc.text(String(l.quantity), { size: 9.5, color: SLATE, x: cols.qty, align: "right" });
    doc.text(formatUsd(l.unitRateMinor), { size: 9.5, color: SLATE, x: cols.unit, align: "right" });
    doc.text(formatUsd(l.amountMinor), { size: 9.5, color: INK, x: cols.amount - 6, align: "right" });
    doc.y = top + 14;
    if (l.code) {
      doc.text(l.code, { size: 7.5, color: MUTED, x: cols.desc + 6 });
      doc.y += 9;
    }
    doc.rule({ color: [0.95, 0.96, 0.97] });
    doc.y += 5;
  }

  doc.gap(4);
  total(doc, "Total", formatUsd(totalMinor), true);
}

function footer(doc: Doc, note: string) {
  doc.gap(12);
  doc.rule();
  doc.gap(8);
  doc.paragraph(note, { size: 7.5, color: MUTED, leading: 10 });
}

/* ── 1. Purchase request ───────────────────────────────────────────── */

export function purchaseRequestPdf(d: {
  prNumber: string;
  orgName: string;
  status: string;
  createdAt: Date;
  requester: string;
  department: string;
  vendor: string;
  justification: string | null;
  lines: LineItem[];
  amountMinor: bigint;
  approvals: { name: string; level: number; at: Date; signed: boolean }[];
}) {
  const doc = new Doc();
  header(doc, "Purchase request", d.prNumber, d.orgName, [
    `Raised ${d.createdAt.toLocaleDateString("en-GB")} by ${d.requester}`,
    `Status: ${d.status.toLowerCase().replace(/_/g, " ")}`,
  ]);

  twoUp(doc, { label: "DEPARTMENT", value: d.department }, { label: "VENDOR", value: d.vendor });
  if (d.justification) {
    field(doc, "JUSTIFICATION", "");
    doc.y -= 6;
    doc.paragraph(d.justification, { size: 9.5, color: INK, leading: 13 });
    doc.gap(8);
  }
  doc.gap(4);
  lineTable(doc, d.lines, d.amountMinor);

  if (d.approvals.length) {
    doc.gap(16);
    doc.line("APPROVALS", { size: 8, font: "Helvetica-Bold", color: SLATE });
    doc.gap(4);
    for (const a of d.approvals) {
      doc.line(
        `Level ${a.level} — ${a.name}, ${a.at.toLocaleString("en-GB")}${a.signed ? " (signed)" : ""}`,
        { size: 9, color: INK },
      );
    }
  }

  footer(
    doc,
    "A purchase request commits nothing. It becomes an order only once it has cleared the approval flow in force when it was submitted.",
  );
  return doc;
}

/* ── 2. Purchase order ─────────────────────────────────────────────── */

export function purchaseOrderPdf(d: {
  poNumber: string;
  prNumber: string;
  orgName: string;
  createdAt: Date;
  vendor: string;
  vendorEmail: string;
  payoutAddress: string;
  paymentTerms: string;
  department: string;
  toleranceBps: number;
  lines: LineItem[];
  amountMinor: bigint;
  onchainTxHash: string | null;
}) {
  const doc = new Doc();
  header(doc, "Purchase order", d.poNumber, d.orgName, [
    `Issued ${d.createdAt.toLocaleDateString("en-GB")} · from ${d.prNumber}`,
    `${d.department}`,
  ]);

  twoUp(
    doc,
    { label: "SUPPLIER", value: d.vendor },
    { label: "PAYMENT TERMS", value: d.paymentTerms },
  );
  twoUp(
    doc,
    { label: "CONTACT", value: d.vendorEmail },
    { label: "MATCH TOLERANCE", value: `${(d.toleranceBps / 100).toFixed(2)}%` },
  );
  field(doc, "SETTLES TO (USDC ON ARC)", d.payoutAddress);

  doc.gap(6);
  lineTable(doc, d.lines, d.amountMinor);

  if (d.onchainTxHash) {
    doc.gap(14);
    doc.line("COMMITTED ON ARC", { size: 8, font: "Helvetica-Bold", color: SLATE });
    doc.gap(3);
    doc.line(d.onchainTxHash, { size: 8.5, color: INDIGO });
  }

  footer(
    doc,
    "The terms above are fixed on chain at issue. Payment releases only when this order, the goods receipt and the supplier's invoice agree within the tolerance stated, and only against approver signatures the contract verifies. An invoice that does not match cannot be paid.",
  );
  return doc;
}

/* ── 3. Goods receipt ──────────────────────────────────────────────── */

export function goodsReceiptPdf(d: {
  grnNumber: string;
  poNumber: string;
  orgName: string;
  createdAt: Date;
  receivedBy: string;
  vendor: string;
  department: string;
  note: string | null;
  lines: LineItem[];
  amountMinor: bigint;
}) {
  const doc = new Doc();
  header(doc, "Goods receipt", d.grnNumber, d.orgName, [
    `Confirmed ${d.createdAt.toLocaleString("en-GB")}`,
    `Against ${d.poNumber}`,
  ]);

  twoUp(doc, { label: "SUPPLIER", value: d.vendor }, { label: "DEPARTMENT", value: d.department });
  field(doc, "CONFIRMED BY", d.receivedBy);

  if (d.note) {
    doc.text("NOTE ON RECEIPT", { size: 8, color: MUTED });
    doc.gap(11);
    doc.paragraph(d.note, { size: 9.5, color: INK, leading: 13 });
    doc.gap(6);
  }

  doc.gap(4);
  lineTable(doc, d.lines, d.amountMinor);

  footer(
    doc,
    "This is the leg of the three-way match that cannot be produced from a desk. It is raised by the requesting side, never by whoever releases payment, and it is what entitles the supplier to invoice.",
  );
  return doc;
}

/* ── 4. Bill and match ─────────────────────────────────────────────── */

export function billPdf(d: {
  billNumber: string;
  poNumber: string;
  grnNumber: string | null;
  invoiceNumber: string | null;
  orgName: string;
  createdAt: Date;
  vendor: string;
  status: string;
  poAmountMinor: bigint;
  invoicedAmountMinor: bigint;
  toleranceMinor: bigint;
  checks: { label: string; passed: boolean; detail: string }[];
}) {
  const doc = new Doc();
  const passed = d.status === "MATCHED" || d.status === "PAID";

  header(doc, "Bill", d.billNumber, d.orgName, [
    `Raised ${d.createdAt.toLocaleDateString("en-GB")} · ${d.vendor}`,
    `Three-way match: ${passed ? "PASSED" : "FAILED"}`,
  ]);

  doc.line("DOCUMENTS COMPARED", { size: 8, font: "Helvetica-Bold", color: SLATE });
  doc.gap(4);
  doc.line(`Order      ${d.poNumber}`, { size: 9.5, color: INK });
  doc.line(`Receipt    ${d.grnNumber ?? "— none"}`, { size: 9.5, color: INK });
  doc.line(`Invoice    ${d.invoiceNumber ?? "— none"}`, { size: 9.5, color: INK });
  doc.gap(12);

  const variance = d.invoicedAmountMinor - d.poAmountMinor;
  total(doc, "Ordered", formatUsd(d.poAmountMinor));
  total(doc, "Invoiced", formatUsd(d.invoicedAmountMinor));
  total(doc, `Tolerance`, formatUsd(d.toleranceMinor));
  doc.rule();
  doc.gap(6);
  const top = doc.y;
  doc.text("Variance", { size: 11, font: "Helvetica-Bold", color: INK });
  doc.text(
    `${variance === 0n ? "" : variance > 0n ? "+" : "-"}${formatUsd(variance < 0n ? -variance : variance)}`,
    { size: 12, font: "Helvetica-Bold", color: passed ? GOOD : BAD, align: "right" },
  );
  doc.y = top + 22;

  doc.line("CHECKS", { size: 8, font: "Helvetica-Bold", color: SLATE });
  doc.gap(4);
  for (const c of d.checks) {
    doc.ensure(28);
    doc.line(`${c.passed ? "[PASS]" : "[FAIL]"}  ${c.label}`, {
      size: 9.5,
      font: c.passed ? "Helvetica" : "Helvetica-Bold",
      color: c.passed ? INK : BAD,
    });
    doc.paragraph(c.detail, { size: 8.5, color: SLATE, leading: 11 });
    doc.gap(3);
  }

  footer(
    doc,
    passed
      ? "All three legs agree. The match is the authorisation — payment releases against approver signatures verified on chain, with no further sign-off."
      : "Payment is unreachable while any check fails. This is not a warning that can be clicked past: the contract has nothing to pay against.",
  );
  return doc;
}

/* ── 5. Remittance advice ──────────────────────────────────────────── */

export function remittancePdf(d: {
  billNumber: string;
  poNumber: string;
  invoiceNumber: string | null;
  orgName: string;
  vendor: string;
  paidAt: Date;
  amountMinor: bigint;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  blockNumber: string | null;
  explorerUrl: string;
}) {
  const doc = new Doc();
  header(doc, "Remittance advice", d.billNumber, d.orgName, [
    `Paid ${d.paidAt.toLocaleString("en-GB")}`,
    `${d.vendor}`,
  ]);

  doc.box(52, { fill: [0.94, 0.98, 0.96] });
  doc.y += 12;
  doc.text("AMOUNT SETTLED", { size: 8, color: MUTED, x: doc.left + 14 });
  doc.y += 13;
  doc.text(`${formatUsd(d.amountMinor)} USDC`, {
    size: 20,
    font: "Helvetica-Bold",
    color: GOOD,
    x: doc.left + 14,
  });
  doc.y += 32;

  twoUp(
    doc,
    { label: "AGAINST ORDER", value: d.poNumber },
    { label: "YOUR INVOICE", value: d.invoiceNumber ?? "—" },
  );
  field(doc, "FROM", d.fromAddress);
  field(doc, "TO", d.toAddress);

  doc.gap(6);
  doc.line("ARC TRANSACTION", { size: 8, font: "Helvetica-Bold", color: SLATE });
  doc.gap(3);
  doc.line(d.txHash, { size: 8.5, color: INDIGO });
  if (d.blockNumber) {
    doc.line(`Block ${d.blockNumber}`, { size: 8.5, color: SLATE });
  }
  doc.gap(2);
  doc.line(`${d.explorerUrl}/tx/${d.txHash}`, { size: 8, color: MUTED });

  footer(
    doc,
    "Settled in USDC on Arc. The transaction above is the payment — it released only after the contract verified the approver signatures, the payout address and the available budget. No reconciliation is required; the hash is the receipt.",
  );
  return doc;
}
