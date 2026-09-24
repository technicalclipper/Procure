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
      title="Payments"
      description="USDC settlement on Arc, released only when the match passes."
      step="Needs the registry contract and the match engine first."
    />
  );
}
