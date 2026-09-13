"use server";

import { unstable_rethrow } from "next/navigation";

import { revalidatePath } from "next/cache";
import { ApprovalModule, PRStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { parseUsd } from "@/lib/units";
import { nextPrNumber, withNumberRetry } from "@/lib/procurement/numbering";
import { runPreChecks, type CheckResult } from "@/lib/procurement/precheck";
import {
  snapshotFlow,
  totalRequired,
} from "@/lib/procurement/approval-flow";

export type CreateResult =
  | { ok: true; id: string; prNumber: string; checks: CheckResult[] }
  | { ok: false; error: string; checks?: CheckResult[] };

type LineInput = {
  itemId: string | null;
  description: string;
  quantity: number;
  unitRateMinor: bigint;
  amountMinor: bigint;
  expenseAccountCode: string | null;
};

/** Lines arrive as a JSON blob so the form can be fully dynamic. */
function parseLines(raw: string): LineInput[] | null {
  try {
    const parsed = JSON.parse(raw) as {
      itemId?: string | null;
      description?: string;
      quantity?: number | string;
      rate?: string;
    }[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map((l) => {
      const qty = Math.max(1, Math.floor(Number(l.quantity ?? 1)));
      const rate = parseUsd(String(l.rate ?? "0"));
      return {
        itemId: l.itemId || null,
        description: String(l.description ?? "").trim(),
        quantity: qty,
        unitRateMinor: rate,
        amountMinor: rate * BigInt(qty),
        expenseAccountCode: null,
      };
    });
  } catch {
    return null;
  }
}

export async function createRequestAction(
  slug: string,
  formData: FormData,
): Promise<CreateResult> {
  try {
    const { org, user } = await requireOrgAccess(slug);

    const departmentId = String(formData.get("departmentId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const justification =
      String(formData.get("justification") ?? "").trim() || null;
    const lines = parseLines(String(formData.get("lines") ?? "[]"));

    if (!departmentId) return { ok: false, error: "Pick a department." };
    if (!vendorId) return { ok: false, error: "Pick a vendor." };
    if (!lines) return { ok: false, error: "Add at least one line." };
    if (lines.some((l) => !l.description)) {
      return { ok: false, error: "Every line needs a description." };
    }
    if (lines.some((l) => l.amountMinor <= 0n)) {
      return { ok: false, error: "Every line needs an amount above zero." };
    }

    // Only a requester or purchaser in that department may raise for it.
    const membership = await db.membership.findFirst({
      where: {
        userId: user.id,
        departmentId,
        role: { in: [Role.REQUESTER, Role.PURCHASER] },
      },
    });
    const { canManage } = await requireOrgAccess(slug);
    if (!membership && !canManage) {
      return {
        ok: false,
        error: "You don't have a requester or purchaser role in that department.",
      };
    }

    const amountMinor = lines.reduce((s, l) => s + l.amountMinor, 0n);

    const checks = await runPreChecks({
      orgId: org.id,
      departmentId,
      vendorId,
      amountMinor,
    });
    const failed = checks.filter((c) => !c.passed);
    if (failed.length > 0) {
      return {
        ok: false,
        error: failed[0].detail,
        checks,
      };
    }

    // Freeze the applicable levels at submit — editing the flow later must
    // not move the bar under a request already in flight.
    const flow = await snapshotFlow(
      org.id,
      ApprovalModule.PURCHASE_REQUEST,
      amountMinor,
    );
    const approvalsRequired = totalRequired(flow);

    // Resolve GL codes from the items now, so later master edits don't
    // rewrite what this request was coded to.
    const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
    const items = itemIds.length
      ? await db.item.findMany({
          where: { id: { in: itemIds }, orgId: org.id },
          select: { id: true, expenseAccountCode: true },
        })
      : [];
    const codeByItem = new Map(items.map((i) => [i.id, i.expenseAccountCode]));

    const created = await withNumberRetry(async () => {
      const prNumber = await nextPrNumber(org.id);
      return db.purchaseRequest.create({
        data: {
          orgId: org.id,
          prNumber,
          status:
            approvalsRequired === 0
              ? PRStatus.APPROVED
              : PRStatus.PENDING_APPROVAL,
          justification,
          amountMinor,
          approvalsRequired,
          flowSnapshot: flow as unknown as object,
          currentLevel: 1,
          requesterId: user.id,
          departmentId,
          vendorId,
          lines: {
            create: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitRateMinor: l.unitRateMinor,
              amountMinor: l.amountMinor,
              itemId: l.itemId,
              expenseAccountCode: l.itemId
                ? (codeByItem.get(l.itemId) ?? null)
                : null,
            })),
          },
        },
      });
    });

    revalidatePath(`/o/${slug}/requests`);
    return {
      ok: true,
      id: created.id,
      prNumber: created.prNumber,
      checks,
    };
  } catch (e) {
    // redirect() and notFound() signal by throwing; let them through.
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Live pre-check feedback while the form is being filled in. */
export async function previewChecksAction(
  slug: string,
  departmentId: string,
  vendorId: string,
  amount: string,
): Promise<{ checks: CheckResult[]; approvalsRequired: number }> {
  const { org } = await requireOrgAccess(slug);
  if (!departmentId || !vendorId) {
    return { checks: [], approvalsRequired: 0 };
  }
  let amountMinor = 0n;
  try {
    amountMinor = parseUsd(amount || "0");
  } catch {
    amountMinor = 0n;
  }
  const [checks, flow] = await Promise.all([
    runPreChecks({ orgId: org.id, departmentId, vendorId, amountMinor }),
    snapshotFlow(org.id, ApprovalModule.PURCHASE_REQUEST, amountMinor),
  ]);
  return { checks, approvalsRequired: totalRequired(flow) };
}
