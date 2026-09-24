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
      title="Trial balance"
      description="Debits and credits, which must agree."
      step="Populates once the journal has entries."
    />
  );
}
