"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrgManage } from "@/lib/org";
import { retryChainSync } from "@/lib/procurement/automation";
import { orgKey, readRegistry, registryAddress } from "@/lib/registry";

export type AutomationState = {
  ok: boolean;
  message?: string;
  error?: string;
};

/**
 * Turning auto-settlement on is a claim about where authority lives, so
 * it refuses when the claim isn't true yet. With no approver set
 * registered on chain the contract will not release anything, and an
 * org that flipped this switch would sit there watching bills match and
 * nothing happen, with no idea why.
 */
export async function setAutoSettleAction(
  slug: string,
  enabled: boolean,
): Promise<AutomationState> {
  try {
    const { org } = await requireOrgManage(slug);

    if (enabled && registryAddress()) {
      const threshold = await readRegistry<number>("threshold", [
        orgKey(org.id),
        1,
      ]).catch(() => 0);

      if (Number(threshold) === 0) {
        return {
          ok: false,
          error:
            "No approver set is registered on Arc for level 1, so the contract will not release anything. Configure an approval level and save it first — otherwise this switch would look on while every settlement silently failed.",
        };
      }
    }

    await db.organization.update({
      where: { id: org.id },
      data: { autoSettle: enabled },
    });

    revalidatePath(`/o/${slug}/settings/automation`);
    return {
      ok: true,
      message: enabled
        ? "Matched bills will settle on Arc without waiting for anyone."
        : "Settlement is manual again — a purchaser releases each payment.",
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function retrySyncAction(slug: string): Promise<AutomationState> {
  try {
    const { org } = await requireOrgManage(slug);
    const report = await retryChainSync(org.id);

    revalidatePath(`/o/${slug}/settings/automation`);

    if (report.attempted === 0) {
      return { ok: true, message: "Nothing needed pushing." };
    }
    if (report.failures.length === 0) {
      return {
        ok: true,
        message: `Checked ${report.attempted}; ${report.succeeded} written to Arc, the rest already matched.`,
      };
    }
    return {
      ok: true,
      message: `${report.succeeded} written, ${report.failures.length} still failing — ${report.failures.slice(0, 3).join("; ")}`,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
