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
      title="People and roles"
      description="Members of this organisation and what they can do."
      step="Comes with invitations: invite by email with a role, accept and join."
    />
  );
}
