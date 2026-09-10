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
      title="Purchase orders"
      description="Issued when a request clears its approval quorum."
      step="Comes with the buy cycle, once approval routing exists."
    />
  );
}
