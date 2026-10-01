import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf/build";
import { billPdf } from "@/lib/pdf/documents";
import { runThreeWayMatch } from "@/lib/procurement/three-way";
import { computeVariance } from "@/lib/procurement/match";

export async function GET(
  _r: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const { org } = await requireOrgAccess(slug);

  const bill = await db.bill.findUnique({
    where: { id },
    include: {
      order: { include: { vendor: true, receipt: true, invoice: true } },
    },
  });
  if (!bill || bill.orgId !== org.id) notFound();

  const match = runThreeWayMatch(bill.order);
  const variance = computeVariance(
    bill.poAmountMinor,
    bill.invoicedAmountMinor,
    bill.order.toleranceBps,
  );

  const doc = billPdf({
    billNumber: bill.billNumber,
    poNumber: bill.order.poNumber,
    grnNumber: bill.order.receipt?.grnNumber ?? null,
    invoiceNumber: bill.order.invoice?.vendorInvoiceNumber ?? null,
    orgName: org.name,
    createdAt: bill.createdAt,
    vendor: bill.order.vendor.name,
    status: bill.status,
    poAmountMinor: bill.poAmountMinor,
    invoicedAmountMinor: bill.invoicedAmountMinor,
    toleranceMinor: variance.toleranceMinor,
    checks: match.checks.map((c) => ({
      label: c.label,
      passed: c.passed,
      detail: c.detail,
    })),
  });

  return pdfResponse(doc, `${bill.billNumber}.pdf`);
}
