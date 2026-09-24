import { requireOrgManage } from "@/lib/org";
import { NotBuilt } from "../not-built";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireOrgManage(slug);
  return (
    <NotBuilt
      slug={slug}
      title="Bills"
      description="A vendor invoice recorded against a purchase order."
      step="Carries both the PO amount and the invoiced amount — the variance between them is what the three-way match tests."
    />
  );
}
