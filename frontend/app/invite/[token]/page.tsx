import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getInvitationByToken } from "@/lib/invitations";
import { describeRole, titleCase } from "@/lib/mail/templates";
import { SignInButton, SyncOnLogin } from "@/app/auth-buttons";
import { AcceptButtons } from "../invite-actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    getInvitationByToken(token),
    getSessionUser(),
  ]);

  if (!invitation) {
    return (
      <Shell>
        <Card>
          <h1 className="text-[19px] font-semibold tracking-tight">
            This invitation isn&apos;t valid
          </h1>
          <p className="mt-2 text-[13px] text-slate-600">
            It may have been used already, revoked, or replaced by a newer
            invitation to the same address.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block text-[13px] text-indigo-600 underline-offset-2 hover:underline"
          >
            Go to Procure
          </Link>
        </Card>
      </Shell>
    );
  }

  const badge = invitation.departmentName
    ? `${titleCase(invitation.role ?? "")} · ${invitation.departmentName}`
    : titleCase(invitation.orgRole);

  const summary = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
        Invitation
      </div>
      <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
        Join {invitation.orgName}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
        {invitation.inviterName} invited{" "}
        <span className="font-medium text-slate-900">{invitation.email}</span>{" "}
        to {invitation.orgName} on Procure.
      </p>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Your role
        </div>
        <div className="mt-1.5 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[12px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
          {badge}
        </div>
        <div className="mt-2 text-[12px] leading-relaxed text-slate-600">
          {describeRole(
            invitation.orgRole,
            invitation.role,
            invitation.departmentName,
          )}
        </div>
      </div>
    </>
  );

  // Expired
  if (invitation.expired) {
    return (
      <Shell>
        <Card>
          {summary}
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            This invitation expired on{" "}
            {invitation.expiresAt.toLocaleDateString("en-GB")}. Ask{" "}
            {invitation.inviterName} to send a new one.
          </div>
        </Card>
      </Shell>
    );
  }

  // Signed out — the token got them here, signing in proves who they are
  if (!user) {
    return (
      <Shell>
        <SyncOnLogin signedIn={false} />
        <Card>
          {summary}
          <div className="mt-6">
            <SignInButton />
            <p className="mt-3 text-[12px] text-slate-500">
              Sign in with <strong>{invitation.email}</strong> to accept. A
              wallet is created for you automatically — no seed phrase, no
              extension.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  // Signed in as somebody else
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Shell>
        <Card>
          {summary}
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            This invitation is for{" "}
            <span className="font-medium">{invitation.email}</span>, but
            you&apos;re signed in as{" "}
            <span className="font-medium">{user.email}</span>. Sign out and
            sign back in with the invited address.
          </div>
          <Link
            href="/"
            className="mt-4 inline-block text-[13px] text-indigo-600 underline-offset-2 hover:underline"
          >
            Go to Procure
          </Link>
        </Card>
      </Shell>
    );
  }

  // Already a member — nothing to accept
  const existing = await db.orgMember.findFirst({
    where: { userId: user.id, org: { slug: invitation.orgSlug } },
  });
  if (existing) redirect(`/o/${invitation.orgSlug}`);

  return (
    <Shell>
      <Card>
        {summary}
        <div className="mt-6">
          <AcceptButtons token={token} />
        </div>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-8">
      {children}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-7">
      {children}
    </div>
  );
}
