import { requireOrgAccess } from "@/lib/org";
import { NotBuilt } from "../../not-built";

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
      title="Outbox"
      description="Every email the workflow fires."
      step="Comes with the workflow engine and notification layer."
    />
  );
}
