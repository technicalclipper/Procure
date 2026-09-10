import { redirect } from "next/navigation";
import { AccountType, OrgRole, Role } from "@prisma/client";
import { db } from "./db";
import { getSessionUser, type SessionUser } from "./session";
import { slugify } from "./slug";

/**
 * Chart of accounts every new organisation starts with.
 *
 * Seeded because a procure-to-pay ledger can't post anything without
 * payables and a GR/IR clearing account, and asking someone to invent a
 * chart of accounts before they can raise a purchase request is absurd.
 * Editable afterwards like anything else.
 *
 * Department cash accounts (1010, 1020, …) are created with each
 * department, not here.
 */
export const DEFAULT_ACCOUNTS: {
  code: string;
  name: string;
  type: AccountType;
}[] = [
  { code: "1000", name: "Cash — USDC Treasury", type: AccountType.ASSET },
  { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
  // Holds the timing difference between goods received and invoice
  // received. A non-zero balance here is the match exception report.
  { code: "2100", name: "GR/IR Clearing", type: AccountType.LIABILITY },
  { code: "3000", name: "Retained Earnings", type: AccountType.EQUITY },
  { code: "5000", name: "Infrastructure Expense", type: AccountType.EXPENSE },
  { code: "5100", name: "Software Expense", type: AccountType.EXPENSE },
  { code: "5200", name: "Professional Services", type: AccountType.EXPENSE },
  { code: "5300", name: "Travel Expense", type: AccountType.EXPENSE },
  { code: "6000", name: "Marketing Expense", type: AccountType.EXPENSE },
];

/** Slug that isn't taken yet — appends -2, -3, … on collision. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "org";
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    const taken = await db.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
  throw new Error("Could not derive a unique slug");
}

export type OrgContext = {
  user: SessionUser;
  org: {
    id: string;
    slug: string;
    name: string;
    treasuryAddress: string | null;
    treasuryWalletId: string | null;
  };
  orgRole: OrgRole;
  /** OWNER or CONTROLLER — may manage departments, masters and invitations. */
  canManage: boolean;
};

/**
 * Resolve the org from the URL and assert the signed-in user belongs to it.
 *
 * Anyone not signed in goes to the landing page; anyone signed in but not a
 * member also goes to the landing page rather than a 403, so an org's
 * existence isn't disclosed by the error.
 */
export async function requireOrgAccess(slug: string): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      treasuryAddress: true,
      treasuryWalletId: true,
    },
  });
  if (!org) redirect("/");

  const membership = await db.orgMember.findUnique({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    select: { orgRole: true },
  });
  if (!membership) redirect("/");

  return {
    user,
    org,
    orgRole: membership.orgRole,
    canManage:
      membership.orgRole === OrgRole.OWNER ||
      membership.orgRole === OrgRole.CONTROLLER,
  };
}

/**
 * Same as requireOrgAccess, but also requires OWNER or CONTROLLER.
 *
 * Hiding a link in the nav is presentation, not access control — anyone
 * can type the URL. Admin-only pages call this so the guard lives with
 * the page rather than with the menu.
 */
export async function requireOrgManage(slug: string): Promise<OrgContext> {
  const ctx = await requireOrgAccess(slug);
  if (!ctx.canManage) redirect(`/o/${slug}`);
  return ctx;
}

/** What the signed-in user may see, used to build the nav. */
export async function getOrgCapabilities(userId: string, orgId: string) {
  const deptRoles = await db.membership.findMany({
    where: { userId, department: { orgId } },
    select: { role: true },
  });
  return {
    isApprover: deptRoles.some((m) => m.role === Role.APPROVER),
    isRequester: deptRoles.some((m) => m.role === Role.REQUESTER),
  };
}

/** Organisations the user belongs to, for the landing page. */
export async function getUserOrgs(userId: string) {
  const memberships = await db.orgMember.findMany({
    where: { userId },
    include: {
      org: {
        select: {
          id: true,
          slug: true,
          name: true,
          treasuryAddress: true,
          _count: { select: { departments: true, members: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.org, orgRole: m.orgRole }));
}
