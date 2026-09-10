"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { InvitationStatus, OrgRole, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/org";
import { renderInvitationEmail } from "@/lib/mail/templates";
import { sendEmail } from "@/lib/mail/send";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 14;

function appUrl() {
  return (
    (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    )
  );
}

/**
 * Build the invitation email.
 *
 * Shared by the send path and the preview endpoint so the two cannot
 * drift — the preview is literally what gets delivered.
 */
async function buildInvitationEmail(opts: {
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  recipientEmail: string;
  orgRole: string;
  deptRole?: string | null;
  departmentName?: string | null;
  token: string;
  expiresAt: Date;
}) {
  return renderInvitationEmail({
    orgName: opts.orgName,
    inviterName: opts.inviterName,
    inviterEmail: opts.inviterEmail,
    recipientEmail: opts.recipientEmail,
    orgRole: opts.orgRole,
    deptRole: opts.deptRole,
    departmentName: opts.departmentName,
    acceptUrl: `${appUrl()}/invite/${opts.token}`,
    expiresAt: opts.expiresAt,
  });
}

export type PreviewResult =
  | { ok: true; subject: string; html: string }
  | { ok: false; error: string };

/** Render the email exactly as it will be sent, without sending it. */
export async function previewInvitationAction(
  slug: string,
  formData: FormData,
): Promise<PreviewResult> {
  try {
    const { org, user, canManage } = await requireOrgAccess(slug);
    if (!canManage) return { ok: false, error: "Not permitted." };

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const orgRole = String(formData.get("orgRole") ?? "MEMBER");
    const deptRole = String(formData.get("deptRole") ?? "") || null;
    const departmentId = String(formData.get("departmentId") ?? "") || null;

    if (!EMAIL.test(email)) {
      return { ok: false, error: "Enter a valid email to preview." };
    }

    let departmentName: string | null = null;
    if (departmentId) {
      const d = await db.department.findUnique({
        where: { id: departmentId },
        select: { name: true, orgId: true },
      });
      if (d && d.orgId === org.id) departmentName = d.name;
    }

    const rendered = await buildInvitationEmail({
      orgName: org.name,
      inviterName: user.name ?? user.email,
      inviterEmail: user.email,
      recipientEmail: email,
      orgRole,
      deptRole: departmentName ? deptRole : null,
      departmentName,
      token: "preview-token",
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    });

    return { ok: true, subject: rendered.subject, html: rendered.html };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function inviteAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { org, user, canManage } = await requireOrgAccess(slug);
    if (!canManage) {
      return { ok: false, error: "Only owners and controllers can invite." };
    }

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const orgRoleRaw = String(formData.get("orgRole") ?? "MEMBER");
    const deptRoleRaw = String(formData.get("deptRole") ?? "");
    const departmentId = String(formData.get("departmentId") ?? "") || null;

    if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email." };
    if (!(Object.values(OrgRole) as string[]).includes(orgRoleRaw)) {
      return { ok: false, error: "Pick an organisation role." };
    }
    if (orgRoleRaw === OrgRole.OWNER) {
      return { ok: false, error: "An organisation has one owner." };
    }

    const deptRole =
      deptRoleRaw && (Object.values(Role) as string[]).includes(deptRoleRaw)
        ? (deptRoleRaw as Role)
        : null;

    if (deptRole && !departmentId) {
      return { ok: false, error: "Pick a department for that role." };
    }

    let departmentName: string | null = null;
    if (departmentId) {
      const d = await db.department.findUnique({ where: { id: departmentId } });
      if (!d || d.orgId !== org.id) {
        return { ok: false, error: "Unknown department." };
      }
      departmentName = d.name;
    }

    // Already a member?
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      const already = await db.orgMember.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId: org.id } },
      });
      if (already) {
        return { ok: false, error: `${email} is already a member.` };
      }
    }

    // Supersede any outstanding invitation rather than stacking them up.
    await db.invitation.updateMany({
      where: { orgId: org.id, email, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED },
    });

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);

    await db.invitation.create({
      data: {
        token,
        email,
        orgId: org.id,
        orgRole: orgRoleRaw as OrgRole,
        departmentId: deptRole ? departmentId : null,
        role: deptRole,
        expiresAt,
        invitedById: user.id,
      },
    });

    const rendered = await buildInvitationEmail({
      orgName: org.name,
      inviterName: user.name ?? user.email,
      inviterEmail: user.email,
      recipientEmail: email,
      orgRole: orgRoleRaw,
      deptRole,
      departmentName,
      token,
      expiresAt,
    });

    const result = await sendEmail({
      event: `INVITATION_SENT:${token}`,
      recipient: email,
      template: "invitation",
      email: rendered,
    });

    revalidatePath(`/o/${slug}/settings/people`);

    const where = departmentName
      ? `${titleCase(deptRole ?? "")} in ${departmentName}`
      : titleCase(orgRoleRaw);

    if (result.sent) {
      return { ok: true, message: `Invitation emailed to ${email} — ${where}.` };
    }
    return {
      ok: true,
      message: result.error
        ? `Invitation created for ${email} (${where}). Email not sent: ${result.error}. It's in the outbox.`
        : `Invitation created for ${email} (${where}). Email sending is off — it's in the outbox.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeInvitationAction(
  slug: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { org, canManage } = await requireOrgAccess(slug);
    if (!canManage) return { ok: false, error: "Not permitted." };

    const id = String(formData.get("id") ?? "");
    const inv = await db.invitation.findUnique({ where: { id } });
    if (!inv || inv.orgId !== org.id) {
      return { ok: false, error: "Unknown invitation." };
    }

    await db.invitation.update({
      where: { id },
      data: { status: InvitationStatus.REVOKED },
    });

    revalidatePath(`/o/${slug}/settings/people`);
    return { ok: true, message: `Invitation to ${inv.email} revoked.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function titleCase(s: string) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}
