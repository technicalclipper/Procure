import { requireOrgAccess } from "@/lib/org";
import { NotBuilt } from "../not-built";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireOrgAccess(slug);
  return (
    <NotBuilt
      slug={slug}
      title="Purchase requests"
      description="Raise a request, route it for approval, turn it into a purchase order."
      step="Comes with the buy cycle: line items from the item master, pre-checks on vendor allowlist, budget and category."
    />
  );
}
