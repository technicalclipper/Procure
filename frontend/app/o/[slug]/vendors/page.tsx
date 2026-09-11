import Link from "next/link";
import { AccountType, RiskBand, Role, VendorStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { AddVendor, VendorStatusControl } from "./vendor-controls";
import { PortalStatusPill } from "./portal-controls";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<VendorStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DRAFT: "bg-amber-50 text-amber-800 ring-amber-600/20",
  BLOCKED: "bg-red-50 text-red-700 ring-red-600/20",
};

const RISK_TONE: Record<RiskBand, string> = {
  CLEAR: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/20",
  BLOCKED: "bg-red-50 text-red-700 ring-red-600/20",
  UNSCREENED: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export default async function VendorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  const [vendors, apAccounts, purchaserRole] = await Promise.all([
    db.vendor.findMany({
      where: { orgId: org.id },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    db.account.findMany({
      where: { orgId: org.id, type: AccountType.LIABILITY, active: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    db.membership.findFirst({
      where: {
        userId: user.id,
        role: Role.PURCHASER,
        department: { orgId: org.id },
      },
      select: { id: true },
    }),
  ]);

  const canEdit = canManage || !!purchaserRole;

  const active = vendors.filter((v) => v.status === VendorStatus.ACTIVE).length;
  const unscreened = vendors.filter(
    (v) => v.riskBand === RiskBand.UNSCREENED && v.status !== VendorStatus.BLOCKED,
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-7 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Vendors</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Suppliers you can pay. A payout address only reaches the payment
            rails once it has been screened and activated — that gate is what
            every other control depends on.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-[19px] font-semibold text-slate-900">
            {active}
          </div>
          <div className="text-[11px] text-slate-400">
            active of {vendors.length}
          </div>
        </div>
      </header>

      {unscreened > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {unscreened} vendor{unscreened === 1 ? "" : "s"} not yet screened.
          Onchain risk screening arrives next — until then, activation is a
          manual decision and is recorded as one.
        </div>
      )}

      {canEdit && (
        <div className="mb-6">
          <AddVendor slug={slug} apAccounts={apAccounts} />
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No vendors yet
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            A vendor is a name, an email for the purchase order, and a payout
            address. You need at least one before a purchase request can be
            raised.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <Th>Vendor</Th>
                <Th>Payout address</Th>
                <Th>Terms</Th>
                <Th>Risk</Th>
                <Th>Portal</Th>
                <Th>Status</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/o/${slug}/vendors/${v.id}`}
                      className="font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline"
                    >
                      {v.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{v.email}</div>
                    {v.category && (
                      <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {v.category}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <a
                      href={explorerAddress(v.payoutAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[12px] text-indigo-600 hover:underline"
                      title={v.payoutAddress}
                    >
                      {shortAddress(v.payoutAddress)} ↗
                    </a>
                  </td>

                  <td className="px-4 py-3 align-top text-slate-600">
                    {v.paymentTerms}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <Link href={`/o/${slug}/vendors/${v.id}`}>
                      <Pill tone={RISK_TONE[v.riskBand]}>
                        {v.riskScore !== null
                          ? `${titleCase(v.riskBand)} · ${v.riskScore}`
                          : `${titleCase(v.riskBand)} — screen`}
                      </Pill>
                    </Link>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <PortalStatusPill status={v.portalStatus} />
                  </td>

                  <td className="px-4 py-3 align-top">
                    <Pill tone={STATUS_TONE[v.status]}>
                      {titleCase(v.status)}
                    </Pill>
                  </td>

                  <td className="w-44 px-4 py-3 text-right align-top">
                    {canEdit && (
                      <VendorStatusControl
                        slug={slug}
                        id={v.id}
                        status={v.status}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
