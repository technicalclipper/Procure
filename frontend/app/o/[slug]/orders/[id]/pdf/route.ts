import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf/build";
import { purchaseOrderPdf } from "@/lib/pdf/documents";

export async function GET(
  _r: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const { org } = await requireOrgAccess(slug);

  const o = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      department: true,
      request: { include: { lines: true } },
    },
  });
  if (!o || o.orgId !== org.id) notFound();

  const doc = purchaseOrderPdf({
    poNumber: o.poNumber,
    prNumber: o.request.prNumber,
    orgName: org.name,
    createdAt: o.createdAt,
    vendor: o.vendor.name,
    vendorEmail: o.vendor.email,
    payoutAddress: o.vendor.payoutAddress,
    paymentTerms: o.vendor.paymentTerms,
    department: o.department.name,
    toleranceBps: o.toleranceBps,
    amountMinor: o.amountMinor,
    onchainTxHash: o.onchainTxHash,
    lines: o.request.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitRateMinor: l.unitRateMinor,
      amountMinor: l.amountMinor,
      code: l.expenseAccountCode,
    })),
  });

  return pdfResponse(doc, `${o.poNumber}.pdf`);
}
