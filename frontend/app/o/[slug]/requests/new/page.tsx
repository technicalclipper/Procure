import Link from "next/link";
import { Role, VendorStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { formatAmount } from "@/lib/units";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, user, canManage } = await requireOrgAccess(slug);

  // Only departments this person may raise for. A controller can raise
  // anywhere; everyone else is limited to where they hold a role.
  const memberships = await db.membership.findMany({
    where: {
      userId: user.id,
      role: { in: [Role.REQUESTER, Role.PURCHASER] },
      department: { orgId: org.id },
    },
    select: { departmentId: true },
  });
  const allowedIds = memberships.map((m) => m.departmentId);

  const [departments, vendors, items] = await Promise.all([
    db.department.findMany({
      where: canManage
        ? { orgId: org.id }
        : { orgId: org.id, id: { in: allowedIds } },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.vendor.findMany({
      where: { orgId: org.id, status: { not: VendorStatus.BLOCKED } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, riskBand: true },
    }),
    db.item.findMany({
      where: { orgId: org.id, active: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        defaultRateMinor: true,
        expenseAccountCode: true,
      },
    }),
  ]);

  if (departments.length === 0) {
    return (
      <Shell slug={slug}>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No department to raise against
          </div>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
            You need a requester or purchaser role in a department before you
            can raise a purchase request. Ask a controller to assign one.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell slug={slug}>
      <RequestForm
        slug={slug}
        departments={departments}
        vendors={vendors}
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          unit: i.unit,
          defaultRate: formatAmount(i.defaultRateMinor),
          expenseAccountCode: i.expenseAccountCode,
        }))}
      />
    </Shell>
  );
}

function Shell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <Link
        href={`/o/${slug}/requests`}
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← Requests
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight">
          New purchase request
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Pick items and a vendor. Pre-checks run as you type, so a request
          that could never be paid is caught here rather than after someone
          has approved it.
        </p>
      </header>
      {children}
    </div>
  );
}
