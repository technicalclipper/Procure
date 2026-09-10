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
      title="Approvals"
      description="Requests waiting on your signature."
      step="Comes with approval routing: anything over the quorum threshold needs 2 of 3 approvers, each signing from their own wallet."
    />
  );
}
