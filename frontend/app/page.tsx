import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getUserOrgs } from "@/lib/org";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { getPendingInvitations } from "@/lib/invitations";
import { describeRole, titleCase } from "@/lib/mail/templates";
import { SignInButton, SignOutButton, SyncOnLogin } from "./auth-buttons";
import { CreateOrg } from "./create-org";
import { AcceptButtons } from "./invite/invite-actions";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, string> = {
  OWNER: "bg-violet-50 text-violet-700 ring-violet-600/20",
  CONTROLLER: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  MEMBER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default async function Landing() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <SyncOnLogin signedIn={false} />
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            Procure
          </div>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight text-slate-900">
            The approval is the payment.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Procure-to-pay for onchain companies. Risk-screened vendors,
            quorum approvals, three-way match, and automatic USDC settlement
            on Arc — where spend controls are enforced by the treasury
            itself, not by software sitting next to it.
          </p>

          <ul className="mt-8 space-y-2.5 text-[13px] text-slate-600">
            <Bullet>
              An invoice that doesn&apos;t match the purchase order{" "}
              <span className="font-medium text-slate-900">cannot be paid</span>{" "}
              — not by policy, by construction.
            </Bullet>
            <Bullet>
              Every department holds its own wallet, funded to exactly its
              budget.
            </Bullet>
            <Bullet>
              Approvals are signatures from your own wallet, not rows in
              someone&apos;s database.
            </Bullet>
          </ul>

          <div className="mt-10">
            <SignInButton />
            <p className="mt-3 text-[12px] text-slate-500">
              Sign in with your email. A wallet is created for you
              automatically — no seed phrase, no extension.
            </p>
          </div>
        </main>
      </>
    );
  }

  const [orgs, invitations] = await Promise.all([
    getUserOrgs(user.id),
    getPendingInvitations(user.email),
  ]);

  return (
    <>
      <SyncOnLogin signedIn />
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-5">
            <div>
              <div className="text-[24px] font-semibold leading-none tracking-tight text-slate-900">
                Procure
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                The approval is the payment.
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[12px] text-slate-900">{user.email}</div>
                {user.walletAddress && (
                  <a
                    href={explorerAddress(user.walletAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-[11px] text-indigo-600 hover:underline"
                    title={user.walletAddress}
                  >
                    {shortAddress(user.walletAddress)} ↗
                  </a>
                )}
              </div>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-8 py-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[19px] font-semibold tracking-tight">
                Your organisations
              </h1>
              <p className="mt-1 text-[13px] text-slate-500">
                Create one, or accept an invitation to join an existing
                organisation.
              </p>
            </div>
            {(orgs.length > 0 || invitations.length > 0) && (
              <CreateOrg variant="inline" />
            )}
          </div>

          {invitations.length > 0 && (
            <section className="mt-6">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Pending invitations
              </div>
              <ul className="space-y-2">
                {invitations.map((inv) => {
                  const badge = inv.departmentName
                    ? `${titleCase(inv.role ?? "")} · ${inv.departmentName}`
                    : titleCase(inv.orgRole);
                  return (
                    <li
                      key={inv.id}
                      className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-medium text-slate-900">
                              {inv.orgName}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                              {badge}
                            </span>
                          </div>
                          <div className="mt-1 text-[12px] text-slate-600">
                            {describeRole(
                              inv.orgRole,
                              inv.role,
                              inv.departmentName,
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Invited by {inv.inviterName} · expires{" "}
                            {inv.expiresAt.toLocaleDateString("en-GB")}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <AcceptButtons token={inv.token} compact />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {orgs.length === 0 && invitations.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <div className="text-[13px] font-medium text-slate-900">
                You don&apos;t belong to any organisation yet
              </div>
              <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500">
                Creating one sets up a treasury wallet and a starter chart of
                accounts. You can add departments and invite people after.
              </p>
              <CreateOrg variant="empty" />
            </div>
          ) : orgs.length === 0 ? null : (
            <ul className="mt-6 space-y-2">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/o/${org.slug}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-slate-900">
                          {org.name}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ROLE_TONE[org.orgRole]}`}
                        >
                          {titleCase(org.orgRole)}
                        </span>
                      </div>
                      <div className="mono mt-0.5 text-[11px] text-slate-400">
                        /o/{org.slug}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-slate-500">
                      <div>
                        {org._count.departments} department
                        {org._count.departments === 1 ? "" : "s"}
                      </div>
                      <div>
                        {org._count.members} member
                        {org._count.members === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Signed in as
            </div>
            <dl className="space-y-1.5 text-[12px]">
              <Row label="Email" value={user.email} />
              <Row
                label="Wallet"
                value={user.walletAddress ?? "provisioning…"}
                mono
              />
              <Row label="Privy DID" value={user.privyDid} mono />
            </dl>
          </div>
        </main>
      </div>
    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
      <span>{children}</span>
    </li>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-all text-slate-900 ${mono ? "mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

