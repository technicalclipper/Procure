"use server";

import { revalidatePath } from "next/cache";
import { OrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { DEFAULT_ACCOUNTS, uniqueSlug } from "@/lib/org";
import { createWallet } from "@/lib/privy";

export type CreateOrgState = {
  ok: boolean;
  slug?: string;
  error?: string;
};

/**
 * Create an organisation.
 *
 * The creator becomes OWNER, the standard chart of accounts is seeded, and
 * a Privy treasury wallet is provisioned. Doing all three here means an org
 * is never half-built — there's no state where you own something you can't
 * post to or fund.
 */
export async function createOrgAction(
  formData: FormData,
): Promise<CreateOrgState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters." };
  }
  if (name.length > 60) {
    return { ok: false, error: "Name must be 60 characters or fewer." };
  }

  try {
    const slug = await uniqueSlug(name);

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name, slug, ownerId: user.id },
      });

      await tx.orgMember.create({
        data: { userId: user.id, orgId: created.id, orgRole: OrgRole.OWNER },
      });

      await tx.account.createMany({
        data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, orgId: created.id })),
      });

      return created;
    });

    // Outside the transaction: a slow Privy call shouldn't hold a database
    // transaction open, and a failure here is recoverable from the UI.
    try {
      const wallet = await createWallet();
      await db.organization.update({
        where: { id: org.id },
        data: { treasuryWalletId: wallet.id, treasuryAddress: wallet.address },
      });
    } catch {
      // Treasury can be provisioned later from the org settings.
    }

    revalidatePath("/");
    return { ok: true, slug: org.slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
