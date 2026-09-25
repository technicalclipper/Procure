import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { explorerAddress } from "@/lib/chain";
import { RiskPanel } from "../risk-panel";
import type { ScreenPayload } from "../screen-actions";

export const dynamic = "force-dynamic";

export default async function VendorDetail({
  params,
}: {
  params: Promise<{ slug: string; vendorId: string }>;
}) {
  const { slug, vendorId } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  const [vendor, purchaser] = await Promise.all([
    db.vendor.findUnique({ where: { id: vendorId } }),
    db.membership.findFirst({
      where: {
        userId: user.id,
        role: Role.PURCHASER,
        department: { orgId: org.id },
      },
      select: { id: true },
    }),
  ]);

  if (!vendor || vendor.orgId !== org.id) notFound();

  const canScreen = canManage || !!purchaser;
  const stored = vendor.riskSignals as unknown as ScreenPayload | null;

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <Link
        href={`/o/${slug}/vendors`}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Vendors
      </Link>

      <header className="mt-3 mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">
            {vendor.name}
          </h1>
          <div className="mt-1 text-[13px] text-slate-500">{vendor.email}</div>
          <a
            href={explorerAddress(vendor.payoutAddress)}
            target="_blank"
            rel="noreferrer"
            className="mono mt-1 inline-block text-[12px] text-indigo-600 hover:underline"
          >
            {vendor.payoutAddress} ↗
          </a>
        </div>
        <div className="shrink-0 text-right text-[12px] text-slate-500">
          <div>{vendor.paymentTerms}</div>
          {vendor.category && <div>{vendor.category}</div>}
        </div>
      </header>

      {vendor.overrideReason && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <span className="font-medium">Activated by override — </span>
          {vendor.overrideReason}
        </div>
      )}

      {canScreen ? (
        <RiskPanel
          slug={slug}
          vendorId={vendor.id}
          vendorName={vendor.name}
          address={vendor.payoutAddress}
          initial={stored?.signals ? stored : null}
          status={vendor.status}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-[13px] text-slate-500">
          Risk screening is managed by purchasers and controllers.
          {vendor.riskScore !== null && (
            <div className="mt-2 text-slate-900">
              Current score: <span className="tabular">{vendor.riskScore}</span>{" "}
              ({vendor.riskBand.toLowerCase()})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
