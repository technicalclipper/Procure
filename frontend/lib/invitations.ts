import { InvitationStatus, OrgRole, Role } from "@prisma/client";
import { db } from "./db";

/**
 * Invitations are matched on email, not on who holds the link.
 *
 * A token proves you received the invitation; it does not prove you are
 * the invitee. So acceptance requires being signed in as the invited
 * address — otherwise a forwarded link would let anyone join.
 */

export type InvitationView = {
  id: string;
  token: string;
  email: string;
  orgRole: OrgRole;
  role: Role | null;
  departmentName: string | null;
  orgName: string;
  orgSlug: string;
  inviterName: string;
  expiresAt: Date;
  expired: boolean;
};

function toView(inv: {
  id: string;
  token: string;
  email: string;
  orgRole: OrgRole;
  role: Role | null;
  expiresAt: Date;
  org: { name: string; slug: string };
  department: { name: string } | null;
  invitedBy: { name: string | null; email: string };
}): InvitationView {
  return {
    id: inv.id,
    token: inv.token,
    email: inv.email,
    orgRole: inv.orgRole,
    role: inv.role,
    departmentName: inv.department?.name ?? null,
    orgName: inv.org.name,
    orgSlug: inv.org.slug,
    inviterName: inv.invitedBy.name ?? inv.invitedBy.email,
    expiresAt: inv.expiresAt,
    expired: inv.expiresAt.getTime() < Date.now(),
  };
}

const INCLUDE = {
  org: { select: { name: true, slug: true } },
  department: { select: { name: true } },
  invitedBy: { select: { name: true, email: true } },
} as const;

/** Pending invitations addressed to this email, for the landing page. */
export async function getPendingInvitations(
  email: string,
): Promise<InvitationView[]> {
  const rows = await db.invitation.findMany({
    where: {
      email: email.toLowerCase(),
      status: InvitationStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

export async function getInvitationByToken(
  token: string,
): Promise<InvitationView | null> {
  const inv = await db.invitation.findUnique({
    where: { token },
    include: INCLUDE,
  });
  if (!inv || inv.status !== InvitationStatus.PENDING) return null;
  return toView(inv);
}

export type AcceptResult =
  | { ok: true; slug: string; orgName: string }
  | { ok: false; error: string };

/**
 * Accept an invitation and join the org.
 *
 * Idempotent on the membership: accepting twice, or accepting when
 * already a member, converges rather than failing.
 */
export async function acceptInvitation(
  token: string,
  user: { id: string; email: string },
): Promise<AcceptResult> {
  const inv = await db.invitation.findUnique({
    where: { token },
    include: INCLUDE,
  });

  if (!inv) return { ok: false, error: "That invitation link isn't valid." };
  if (inv.status === InvitationStatus.ACCEPTED) {
    return { ok: false, error: "That invitation has already been used." };
  }
  if (inv.status === InvitationStatus.REVOKED) {
    return { ok: false, error: "That invitation was revoked." };
  }
  if (inv.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "That invitation has expired." };
  }

  // The token got them here; the email is what authorises them.
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invitation is for ${inv.email}. You're signed in as ${user.email}.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.orgMember.upsert({
      where: { userId_orgId: { userId: user.id, orgId: inv.orgId } },
      update: {},
      create: {
        userId: user.id,
        orgId: inv.orgId,
        orgRole: inv.orgRole,
      },
    });

    if (inv.departmentId && inv.role) {
      await tx.membership.upsert({
        where: {
          userId_departmentId_role: {
            userId: user.id,
            departmentId: inv.departmentId,
            role: inv.role,
          },
        },
        update: {},
        create: {
          userId: user.id,
          departmentId: inv.departmentId,
          role: inv.role,
        },
      });
    }

    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
  });

  return { ok: true, slug: inv.org.slug, orgName: inv.org.name };
}
