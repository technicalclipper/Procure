import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf/build";
import { goodsReceiptPdf } from "@/lib/pdf/documents";

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
      receipt: { include: { receivedBy: true } },
      request: { include: { lines: true } },
    },
  });
  if (!o || o.orgId !== org.id || !o.receipt) notFound();

  const doc = goodsReceiptPdf({
    grnNumber: o.receipt.grnNumber,
    poNumber: o.poNumber,
    orgName: org.name,
    createdAt: o.receipt.createdAt,
    receivedBy: o.receipt.receivedBy.name ?? o.receipt.receivedBy.email,
    vendor: o.vendor.name,
    department: o.department.name,
    note: o.receipt.note,
    amountMinor: o.amountMinor,
    lines: o.request.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitRateMinor: l.unitRateMinor,
      amountMinor: l.amountMinor,
    })),
  });

  return pdfResponse(doc, `${o.receipt.grnNumber}.pdf`);
}
