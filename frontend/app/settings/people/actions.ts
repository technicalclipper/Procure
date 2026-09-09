"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createWallet } from "@/lib/privy";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

const ROLES = Object.values(Role) as string[];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite a user and give them their first role.
 *
 * A Privy embedded wallet is provisioned immediately because approvals are
 * signatures from that wallet, not database rows — a user without one
 * cannot approve anything, which is a confusing state to discover later.
 */
export async function inviteUserAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const departmentId = String(formData.get("departmentId") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email." };
    if (!name) return { ok: false, error: "Name is required." };
    if (!ROLES.includes(role)) return { ok: false, error: "Pick a role." };

    const org = await db.organization.findFirstOrThrow();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return {
        ok: false,
        error: `${email} is already a member — add another role from their row instead.`,
      };
    }

    // A controller is org-wide; everyone else is scoped to one department.
    let targets: { id: string; name: string }[];
    if (role === Role.CONTROLLER) {
      targets = await db.department.findMany({
        where: { orgId: org.id },
        select: { id: true, name: true },
      });
    } else {
      if (!departmentId) {
        return { ok: false, error: "Pick a department for this role." };
      }
      const dept = await db.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true },
      });
      if (!dept) return { ok: false, error: "Unknown department." };
      targets = [dept];
    }

    const user = await db.user.create({
      data: { orgId: org.id, email, name },
    });

    await db.membership.createMany({
      data: targets.map((d) => ({
        userId: user.id,
        departmentId: d.id,
        role: role as Role,
      })),
      skipDuplicates: true,
    });

    let walletNote = "";
    try {
      const wallet = await createWallet();
      await db.user.update({
        where: { id: user.id },
        data: { walletId: wallet.id, address: wallet.address },
      });
      walletNote = ` Wallet ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)} provisioned.`;
    } catch {
      walletNote = " Wallet provisioning failed — retry from their row.";
    }

    revalidatePath("/settings/people");
    return {
      ok: true,
      message:
        role === Role.CONTROLLER
          ? `${name} added as Controller across all ${targets.length} departments.${walletNote}`
          : `${name} added as ${titleCase(role)} in ${targets[0].name}.${walletNote}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Roles are per (user, department) — the same person can request in one
 *  department and approve for another. */
export async function addRoleAction(formData: FormData): Promise<ActionState> {
  try {
    const userId = String(formData.get("userId") ?? "");
    const departmentId = String(formData.get("departmentId") ?? "");
    const role = String(formData.get("role") ?? "");

    if (!ROLES.includes(role)) return { ok: false, error: "Pick a role." };
    if (!departmentId) return { ok: false, error: "Pick a department." };

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const dept = await db.department.findUniqueOrThrow({
      where: { id: departmentId },
    });

    const clash = await db.membership.findUnique({
      where: {
        userId_departmentId_role: { userId, departmentId, role: role as Role },
      },
    });
    if (clash) {
      return {
        ok: false,
        error: `${user.name} is already ${titleCase(role)} in ${dept.name}.`,
      };
    }

    await db.membership.create({
      data: { userId, departmentId, role: role as Role },
    });

    revalidatePath("/settings/people");
    return {
      ok: true,
      message: `${user.name} is now ${titleCase(role)} in ${dept.name}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeRoleAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("membershipId") ?? "");
    const membership = await db.membership.findUniqueOrThrow({
      where: { id },
      include: { user: true, department: true },
    });

    // Losing the last approver in a department would strand every request
    // raised there with no way to reach quorum.
    if (membership.role === Role.APPROVER) {
      const remaining = await db.membership.count({
        where: { departmentId: membership.departmentId, role: Role.APPROVER },
      });
      if (remaining <= 1) {
        return {
          ok: false,
          error: `${membership.department.name} would have no approvers left — requests there could never be approved.`,
        };
      }
    }

    await db.membership.delete({ where: { id } });
    revalidatePath("/settings/people");
    return {
      ok: true,
      message: `Removed ${titleCase(membership.role)} in ${membership.department.name} from ${membership.user.name}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function provisionUserWalletAction(
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("userId") ?? "");
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    if (user.walletId) return { ok: true, message: "Already provisioned." };

    const wallet = await createWallet();
    await db.user.update({
      where: { id },
      data: { walletId: wallet.id, address: wallet.address },
    });

    revalidatePath("/settings/people");
    return { ok: true, message: `Wallet provisioned for ${user.name}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function titleCase(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
