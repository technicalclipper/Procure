"use server";

import { revalidatePath } from "next/cache";
import { AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { provisionWallets } from "@/lib/provision";
import { createWallet } from "@/lib/privy";
import { parseUsd } from "@/lib/units";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

/**
 * Provision any missing Privy wallets for the org.
 *
 * Idempotent — wallet IDs are persisted to the database, so this only
 * creates what's absent. Re-running never orphans a funded wallet.
 */
export async function provisionAction(): Promise<
  ActionState & { created?: string[] }
> {
  try {
    const org = await db.organization.findFirstOrThrow();
    const created = await provisionWallets(org.id);
    revalidatePath("/settings/wallets");
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Next code in the 1000-series cash accounts.
 *
 * A department needs its own cash account or the ledger can't tell whose
 * money moved, so we create one rather than making the user pick.
 */
async function nextCashAccountCode(orgId: string): Promise<string> {
  const cash = await db.account.findMany({
    where: { orgId, type: AccountType.ASSET, code: { startsWith: "10" } },
    select: { code: true },
  });
  const highest = cash.reduce((max, a) => {
    const n = Number(a.code);
    return Number.isFinite(n) && n > max ? n : max;
  }, 1000);
  return String(highest + 10);
}

export async function createDepartmentAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase();
    const budgetRaw = String(formData.get("budget") ?? "0").trim();

    if (!name) return { ok: false, error: "Name is required." };
    if (!/^[A-Z0-9]{2,6}$/.test(code)) {
      return { ok: false, error: "Code must be 2–6 letters or digits." };
    }

    let budgetMinor: bigint;
    try {
      budgetMinor = parseUsd(budgetRaw || "0");
    } catch {
      return { ok: false, error: `"${budgetRaw}" is not a valid amount.` };
    }
    if (budgetMinor < 0n) {
      return { ok: false, error: "Budget cannot be negative." };
    }

    const org = await db.organization.findFirstOrThrow();

    const clash = await db.department.findUnique({
      where: { orgId_code: { orgId: org.id, code } },
    });
    if (clash) {
      return { ok: false, error: `Department code ${code} already exists.` };
    }

    // Give the department its own cash account in the chart of accounts.
    const cashCode = await nextCashAccountCode(org.id);
    await db.account.create({
      data: {
        orgId: org.id,
        code: cashCode,
        name: `Cash — USDC ${name}`,
        type: AccountType.ASSET,
      },
    });

    const dept = await db.department.create({
      data: {
        orgId: org.id,
        name,
        code,
        budgetMinor,
        cashAccountCode: cashCode,
      },
    });

    // Provision immediately — a department without a wallet can't be paid
    // from, and leaving it half-created is a worse state to reason about.
    let walletNote = "";
    try {
      const wallet = await createWallet();
      await db.department.update({
        where: { id: dept.id },
        data: { walletId: wallet.id, address: wallet.address },
      });
      walletNote = ` Wallet ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)} provisioned.`;
    } catch {
      walletNote = " Wallet provisioning failed — use Provision to retry.";
    }

    revalidatePath("/settings/wallets");
    return {
      ok: true,
      message: `${name} (${code}) created with cash account ${cashCode}.${walletNote}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBudgetAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const budgetRaw = String(formData.get("budget") ?? "").trim();

    let budgetMinor: bigint;
    try {
      budgetMinor = parseUsd(budgetRaw);
    } catch {
      return { ok: false, error: `"${budgetRaw}" is not a valid amount.` };
    }
    if (budgetMinor < 0n) return { ok: false, error: "Budget cannot be negative." };

    const dept = await db.department.update({
      where: { id },
      data: { budgetMinor },
    });

    revalidatePath("/settings/wallets");
    return { ok: true, message: `${dept.name} budget updated.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
