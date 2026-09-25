"use server";

import { revalidatePath } from "next/cache";
import { getAddress, isAddress } from "viem";
import { AccountType, Role, VendorStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Only purchasers and admins manage vendors.
 *
 * A requester can see the list — they pick a vendor when raising a
 * request — but adding one is what puts an address in front of the
 * payment rails, so it stays with procurement.
 */
async function requireVendorManage(slug: string) {
  const ctx = await requireOrgAccess(slug);
  if (ctx.canManage) return ctx;

  const purchaser = await db.membership.findFirst({
    where: {
      userId: ctx.user.id,
      role: Role.PURCHASER,
      department: { orgId: ctx.org.id },
    },
    select: { id: true },
  });
  if (!purchaser) return null;
  return ctx;
}

export async function createVendorAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireVendorManage(slug);
    if (!ctx) {
      return { ok: false, error: "Only purchasers and controllers can add vendors." };
    }
    const { org } = ctx;

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const rawAddress = String(formData.get("payoutAddress") ?? "").trim();
    const paymentTerms = String(formData.get("paymentTerms") ?? "Net 30").trim();
    const category = String(formData.get("category") ?? "").trim() || null;
    const apAccountCode =
      String(formData.get("apAccountCode") ?? "").trim() || null;

    if (!name) return { ok: false, error: "Name is required." };
    if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email." };

    if (!isAddress(rawAddress)) {
      return {
        ok: false,
        error: "Payout address must be a valid EVM address (0x + 40 hex characters).",
      };
    }
    // Checksum it. Storing mixed-case variants of the same address would
    // let the same payee slip past a duplicate check.
    const payoutAddress = getAddress(rawAddress);

    const clash = await db.vendor.findFirst({
      where: { orgId: org.id, payoutAddress },
    });
    if (clash) {
      return {
        ok: false,
        error: `That payout address already belongs to ${clash.name}.`,
      };
    }

    if (apAccountCode) {
      const account = await db.account.findUnique({
        where: { orgId_code: { orgId: org.id, code: apAccountCode } },
      });
      if (!account || account.type !== AccountType.LIABILITY) {
        return { ok: false, error: "AP account must be a liability account." };
      }
    }

    const vendor = await db.vendor.create({
      data: {
        orgId: org.id,
        name,
        email,
        payoutAddress,
        paymentTerms: paymentTerms || "Net 30",
        category,
        apAccountCode,
        // DRAFT until screened. Nothing can be paid to an unscreened
        // address — the risk gate in the next step is what promotes it.
        status: VendorStatus.DRAFT,
      },
    });

    revalidatePath(`/o/${slug}/vendors`);
    return {
      ok: true,
      message: `${vendor.name} added as draft — screen the payout address before it can be paid.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setVendorStatusAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireVendorManage(slug);
    if (!ctx) return { ok: false, error: "Not permitted." };

    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");

    if (!(Object.values(VendorStatus) as string[]).includes(status)) {
      return { ok: false, error: "Unknown status." };
    }

    const vendor = await db.vendor.findUnique({ where: { id } });
    if (!vendor || vendor.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown vendor." };
    }

    // Activating is what puts an address on the payment rails, so it
    // needs the risk screen. That gate arrives with the next feature;
    // until then activation is explicit and recorded.
    await db.vendor.update({
      where: { id },
      data: { status: status as VendorStatus },
    });

    revalidatePath(`/o/${slug}/vendors`);
    return {
      ok: true,
      message: `${vendor.name} is now ${status.toLowerCase()}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
