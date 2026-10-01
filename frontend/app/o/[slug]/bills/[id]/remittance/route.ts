import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf/build";
import { remittancePdf } from "@/lib/pdf/documents";
import { arcTestnet } from "@/lib/chain";

export async function GET(
  _r: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const { org } = await requireOrgAccess(slug);

  const bill = await db.bill.findUnique({
    where: { id },
    include: {
      payment: true,
      order: { include: { vendor: true, invoice: true } },
    },
  });
  if (!bill || bill.orgId !== org.id) notFound();
  // No hash, no remittance. A remittance advice without a settled
  // transaction is a promise, and this document is a receipt.
  if (!bill.payment?.txHash) notFound();

  const doc = remittancePdf({
    billNumber: bill.billNumber,
    poNumber: bill.order.poNumber,
    invoiceNumber: bill.order.invoice?.vendorInvoiceNumber ?? null,
    orgName: org.name,
    vendor: bill.order.vendor.name,
    paidAt: bill.payment.confirmedAt ?? bill.payment.createdAt,
    amountMinor: bill.payment.amountMinor,
    fromAddress: bill.payment.fromAddress,
    toAddress: bill.payment.toAddress,
    txHash: bill.payment.txHash,
    blockNumber: bill.payment.blockNumber?.toString() ?? null,
    explorerUrl: arcTestnet.blockExplorers?.default.url ?? "",
  });

  return pdfResponse(doc, `${bill.billNumber}-remittance.pdf`);
}
