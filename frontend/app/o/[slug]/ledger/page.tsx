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
      title="Journal"
      description="Every balanced entry the cycle posts."
      step="Populates once goods receipts, bills and payments exist."
    />
  );
}
