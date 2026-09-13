import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf/build";
import { purchaseRequestPdf } from "@/lib/pdf/documents";

export async function GET(
  _r: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const { org } = await requireOrgAccess(slug);

  const pr = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      lines: true,
      requester: true,
      department: true,
      vendor: true,
      approvals: { include: { approver: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!pr || pr.orgId !== org.id) notFound();

  const doc = purchaseRequestPdf({
    prNumber: pr.prNumber,
    orgName: org.name,
    status: pr.status,
    createdAt: pr.createdAt,
    requester: pr.requester.name ?? pr.requester.email,
    department: pr.department.name,
    vendor: pr.vendor.name,
    justification: pr.justification,
    amountMinor: pr.amountMinor,
    lines: pr.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitRateMinor: l.unitRateMinor,
      amountMinor: l.amountMinor,
      code: l.expenseAccountCode,
    })),
    approvals: pr.approvals
      .filter((a) => a.approved)
      .map((a) => ({
        name: a.approver.name ?? a.approver.email,
        level: a.level,
        at: a.createdAt,
        signed: !!a.signature,
      })),
  });

  return pdfResponse(doc, `${pr.prNumber}.pdf`);
}
