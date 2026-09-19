import { db } from "./db";
import { createWallet } from "./privy";

/**
 * Idempotent Privy wallet provisioning.
 *
 * Wallet IDs live in the database, not in env — so a restart reuses the
 * existing wallets instead of spawning new ones and orphaning any funds
 * already sent to them.
 *
 * Safe to call repeatedly; it only creates what is missing.
 */
export async function provisionWallets(orgId: string) {
  const created: string[] = [];

  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { departments: { orderBy: { code: "asc" } } },
  });

  // Treasury — the org's float
  if (!org.treasuryWalletId) {
    const wallet = await createWallet();
    await db.organization.update({
      where: { id: org.id },
      data: { treasuryWalletId: wallet.id, treasuryAddress: wallet.address },
    });
    created.push(`treasury (${wallet.address})`);
  }

  // One server wallet per department. Pre-funded to exactly its budget,
  // so a department physically cannot overspend.
  for (const dept of org.departments) {
    if (dept.walletId) continue;
    const wallet = await createWallet();
    await db.department.update({
      where: { id: dept.id },
      data: { walletId: wallet.id, address: wallet.address },
    });
    created.push(`${dept.code} (${wallet.address})`);
  }

  return created;
}
