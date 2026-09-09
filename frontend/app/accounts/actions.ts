"use server";

import { revalidatePath } from "next/cache";
import { AccountType } from "@prisma/client";
import { db } from "@/lib/db";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

const TYPES = Object.values(AccountType) as string[];

/**
 * Conventional code ranges. Not enforced — plenty of real charts deviate —
 * but we warn, because a payables account numbered 5xxx will quietly break
 * anyone reading the trial balance.
 */
const RANGE: Record<AccountType, [number, number]> = {
  ASSET: [1000, 1999],
  LIABILITY: [2000, 2999],
  EQUITY: [3000, 3999],
  INCOME: [4000, 4999],
  EXPENSE: [5000, 6999],
};

export async function createAccountAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim();
    const subtype = String(formData.get("subtype") ?? "").trim() || null;

    if (!/^\d{3,6}$/.test(code)) {
      return { ok: false, error: "Code must be 3–6 digits." };
    }
    if (!name) return { ok: false, error: "Name is required." };
    if (!TYPES.includes(type)) return { ok: false, error: "Pick a type." };

    const org = await db.organization.findFirstOrThrow();

    const clash = await db.account.findUnique({
      where: { orgId_code: { orgId: org.id, code } },
    });
    if (clash) {
      return { ok: false, error: `Account ${code} already exists (${clash.name}).` };
    }

    const [lo, hi] = RANGE[type as AccountType];
    const n = Number(code);
    const outOfRange = n < lo || n > hi;

    await db.account.create({
      data: { orgId: org.id, code, name, type: type as AccountType, subtype },
    });

    revalidatePath("/accounts");
    return {
      ok: true,
      message: outOfRange
        ? `${code} ${name} created — note ${type} accounts conventionally sit in ${lo}–${hi}.`
        : `${code} ${name} created.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Accounts are never deleted once posted against — that would tear a hole
 * in the ledger. Deactivating hides them from pickers while leaving history
 * intact.
 */
export async function toggleAccountAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const account = await db.account.findUniqueOrThrow({ where: { id } });

    if (account.active) {
      const used = await db.journalLine.count({ where: { accountId: id } });
      const linked = await db.item.count({ where: { expenseAccountId: id } });
      if (linked > 0) {
        return {
          ok: false,
          error: `${account.code} is the default account for ${linked} item(s). Reassign them first.`,
        };
      }
      await db.account.update({ where: { id }, data: { active: false } });
      revalidatePath("/accounts");
      return {
        ok: true,
        message: `${account.code} deactivated${used > 0 ? ` — ${used} existing journal line(s) untouched` : ""}.`,
      };
    }

    await db.account.update({ where: { id }, data: { active: true } });
    revalidatePath("/accounts");
    return { ok: true, message: `${account.code} reactivated.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function renameAccountAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Name is required." };

    const account = await db.account.update({ where: { id }, data: { name } });
    revalidatePath("/accounts");
    return { ok: true, message: `${account.code} renamed.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
