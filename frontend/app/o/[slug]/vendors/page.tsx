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
      title="Vendors"
      description="Suppliers you can pay, screened before they reach the allowlist."
      step="Next up: the vendor master, then onchain risk screening that gates the payment allowlist."
    />
  );
}
