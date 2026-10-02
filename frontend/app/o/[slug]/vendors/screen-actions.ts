"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { RiskBand, Role, VendorStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { screenAddress, type Signal } from "@/lib/risk/signals";
import { writeNarrative } from "@/lib/risk/narrative";
import { buildGraph, type CounterpartyGraph } from "@/lib/risk/network";

export type ScreenPayload = {
  score: number;
  band: RiskBand;
  narrative: string;
  narrativeModel: string | null;
  narrativeError?: string;
  signals: Signal[];
  stats: Record<string, unknown>;
  graph: CounterpartyGraph;
  fetchedAt: string;
};

export type ScreenResult =
  | { ok: true; payload: ScreenPayload }
  | { ok: false; error: string };

async function canScreen(slug: string) {
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
  return purchaser ? ctx : null;
}

/**
 * Screen a vendor's payout address and persist the result.
 *
 * The score comes from deterministic signals over indexed transfer data;
 * the narrative is written afterwards from those same signals. Keeping
 * that order means the verdict is reproducible and auditable — the model
 * explains a decision it did not make.
 */
export async function screenVendorAction(
  slug: string,
  vendorId: string,
): Promise<ScreenResult> {
  try {
    const ctx = await canScreen(slug);
    if (!ctx) {
      return { ok: false, error: "Only purchasers and controllers can screen." };
    }

    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || vendor.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown vendor." };
    }

    const result = await screenAddress(vendor.payoutAddress);
    const graph = buildGraph(
      vendor.payoutAddress,
      result.raw.inbound,
      result.raw.outbound,
    );
    const narrative = await writeNarrative(result, vendor.name);

    const band = result.band as RiskBand;

    const payload: ScreenPayload = {
      score: result.score,
      band,
      narrative: narrative.text,
      narrativeModel: narrative.model,
      narrativeError: narrative.error,
      signals: result.signals,
      stats: result.stats as unknown as Record<string, unknown>,
      graph,
      fetchedAt: result.fetchedAt,
    };

    await db.vendor.update({
      where: { id: vendorId },
      data: {
        riskScore: result.score,
        riskBand: band,
        riskNarrative: narrative.text,
        riskAssessedAt: new Date(),
        riskSignals: payload as unknown as object,
        // A screen never activates a vendor on its own. It can only
        // demote: an address that screens BLOCKED must not stay payable
        // just because someone activated it earlier.
        ...(band === RiskBand.BLOCKED && vendor.status === VendorStatus.ACTIVE
          ? { status: VendorStatus.DRAFT }
          : {}),
      },
    });

    revalidatePath(`/o/${slug}/vendors`);
    revalidatePath(`/o/${slug}/vendors/${vendorId}`);
    return { ok: true, payload };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Put a screened address on the payment allowlist.
 *
 * BLOCKED requires a written justification, which is stored on the
 * vendor. Real AP systems have this escape hatch and auditors expect it;
 * what they do not accept is an override with no reason attached.
 */
export async function approveVendorAction(
  slug: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const ctx = await canScreen(slug);
    if (!ctx) return { ok: false, error: "Not permitted." };

    const id = String(formData.get("id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    const vendor = await db.vendor.findUnique({ where: { id } });
    if (!vendor || vendor.orgId !== ctx.org.id) {
      return { ok: false, error: "Unknown vendor." };
    }

    if (vendor.riskBand === RiskBand.UNSCREENED) {
      return { ok: false, error: "Screen the address before activating it." };
    }

    if (vendor.riskBand === RiskBand.BLOCKED && reason.length < 10) {
      return {
        ok: false,
        error:
          "This address screened as blocked. Activating it needs a written justification of at least 10 characters — it is recorded against the vendor.",
      };
    }

    await db.vendor.update({
      where: { id },
      data: {
        status: VendorStatus.ACTIVE,
        overrideReason:
          vendor.riskBand === RiskBand.BLOCKED
            ? `${ctx.user.email}: ${reason}`
            : vendor.overrideReason,
      },
    });

    revalidatePath(`/o/${slug}/vendors`);
    revalidatePath(`/o/${slug}/vendors/${id}`);
    return {
      ok: true,
      message:
        vendor.riskBand === RiskBand.BLOCKED
          ? `${vendor.name} activated with a recorded override.`
          : `${vendor.name} is now on the payment allowlist.`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
