"use server";

import { revalidatePath } from "next/cache";
import { AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { parseUsd } from "@/lib/units";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

export async function createItemAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { org, canManage } = await requireOrgAccess(slug);
    if (!canManage) {
      return { ok: false, error: "Only owners and controllers can do this." };
    }

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const unit = String(formData.get("unit") ?? "unit").trim() || "unit";
    const category = String(formData.get("category") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const accountId = String(formData.get("accountId") ?? "").trim();
    const rateRaw = String(formData.get("rate") ?? "0").trim();

    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
      return { ok: false, error: "Code must be 2–20 letters, digits, - or _." };
    }
    if (!name) return { ok: false, error: "Name is required." };

    let rateMinor: bigint;
    try {
      rateMinor = parseUsd(rateRaw || "0");
    } catch {
      return { ok: false, error: `"${rateRaw}" is not a valid amount.` };
    }
    if (rateMinor < 0n) return { ok: false, error: "Rate cannot be negative." };

    const clash = await db.item.findUnique({
      where: { orgId_code: { orgId: org.id, code } },
    });
    if (clash) {
      return { ok: false, error: `Item ${code} already exists (${clash.name}).` };
    }

    // The default expense account is the whole point of the item master:
    // it is what lets a purchase request line code itself to the GL
    // without a requester picking an account they don't understand.
    let expenseAccountCode: string | null = null;
    if (accountId) {
      const account = await db.account.findUnique({ where: { id: accountId } });
      if (!account || account.orgId !== org.id) {
        return { ok: false, error: "Unknown expense account." };
      }
      if (account.type !== AccountType.EXPENSE) {
        return { ok: false, error: `${account.code} is not an expense account.` };
      }
      expenseAccountCode = account.code;
    }

    await db.item.create({
      data: {
        orgId: org.id,
        code,
        name,
        description,
        unit,
        category,
        defaultRateMinor: rateMinor,
        expenseAccountId: accountId || null,
        expenseAccountCode,
      },
    });

    revalidatePath(`/o/${slug}/items`);
    return {
      ok: true,
      message: expenseAccountCode
        ? `${code} ${name} created, coding to ${expenseAccountCode}.`
        : `${code} ${name} created — no default account, so requests using it need manual GL coding.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleItemAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { org, canManage } = await requireOrgAccess(slug);
    if (!canManage) {
      return { ok: false, error: "Only owners and controllers can do this." };
    }

    const id = String(formData.get("id") ?? "");
    const item = await db.item.findUnique({ where: { id } });
    if (!item || item.orgId !== org.id) {
      return { ok: false, error: "Unknown item." };
    }

    await db.item.update({ where: { id }, data: { active: !item.active } });
    revalidatePath(`/o/${slug}/items`);
    return {
      ok: true,
      message: `${item.code} ${item.active ? "deactivated" : "reactivated"}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
