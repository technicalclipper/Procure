"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { provisionWallets } from "@/lib/provision";

export type ProvisionState = {
  ok: boolean;
  created?: string[];
  error?: string;
};

/**
 * Provision any missing Privy wallets for the org.
 *
 * Idempotent — wallet IDs are persisted to the database, so this only
 * creates what's absent. Re-running never orphans a funded wallet.
 */
export async function provisionAction(): Promise<ProvisionState> {
  try {
    const org = await db.organization.findFirstOrThrow();
    const created = await provisionWallets(org.id);
    revalidatePath("/settings/wallets");
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
