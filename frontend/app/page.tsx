import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getUserOrgs } from "@/lib/org";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { getPendingInvitations } from "@/lib/invitations";
import { describeRole, titleCase } from "@/lib/mail/templates";
import { registryAddress } from "@/lib/registry";
import { SignInButton, SignOutButton, SyncOnLogin } from "./auth-buttons";
import { CreateOrg } from "./create-org";
import { AcceptButtons } from "./invite/invite-actions";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, string> = {
  OWNER: "bg-violet-50 text-violet-700 ring-violet-600/20",
  CONTROLLER: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  MEMBER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

/**
 * Landing page.
 *
 * The same page signed in or out: the product explains itself on the
 * left and the sidebar changes from "sign in" to "your organisations".
 * Someone arriving for the first time and someone coming back to open
 * their org both want the fastest route to the thing they came for, and
 * a separate marketing site would only put a click between them.
 */
export default async function Landing() {
  const user = await getSessionUser();

  const [orgs, invitations] = user
    ? await Promise.all([
        getUserOrgs(user.id),
        getPendingInvitations(user.email),
      ])
    : [[], []];

  const registry = registryAddress();

  return (
    <>
      <SyncOnLogin signedIn={!!user} />

      <div className="min-h-screen bg-white">
        {/* ── top bar ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
            <div className="flex items-baseline gap-3">
              <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-slate-900">
                Procure
              </span>
              <span className="hidden text-[13px] text-slate-500 sm:inline">
                The approval is the payment.
              </span>
            </div>

            <div className="flex items-center gap-4">
              <a
                href="https://github.com/technicalclipper/Procure"
                target="_blank"
                rel="noreferrer"
                className="hidden text-[12px] text-slate-500 hover:text-slate-900 sm:inline"
              >
                Source ↗
              </a>
              {user ? (
                <>
                  <div className="hidden text-right sm:block">
                    <div className="text-[12px] leading-tight text-slate-900">
                      {user.email}
                    </div>
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
                </>
              ) : (
                <SignInButton />
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_340px] lg:gap-14 lg:py-16">
          {/* ── the pitch ─────────────────────────────────────────── */}
          <main>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live on Arc testnet
              {registry && (
                <a
                  href={explorerAddress(registry)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-indigo-600 hover:underline"
                >
                  {shortAddress(registry)} ↗
                </a>
              )}
            </div>

            <h1 className="mt-6 max-w-2xl text-[44px] font-semibold leading-[1.08] tracking-[-0.02em] text-slate-900">
              An invoice that doesn&apos;t match the purchase order{" "}
              <span className="text-indigo-600">cannot be paid.</span>
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-slate-600">
              Not by policy — by construction. Procure is procure-to-pay for
              companies whose treasury is onchain: purchase requests,
              approvals, orders, goods receipt, vendor invoicing and a
              three-way match that settles in USDC on Arc.
            </p>

            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-slate-500">
              Spend software normally enforces these rules in application
              code, which means they hold exactly as long as the application
              does. Here they live in a contract. Compromise the server and
              you still cannot pay an unapproved vendor an unapproved amount.
            </p>

            {/* how it works */}
            <div className="mt-12">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                The cycle
              </h2>
              <ol className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <Step
                  n="01"
                  title="Request and approve"
                  body="Anyone raises a request against their department's budget. Approvers sign it with their own wallet — free, instant, no gas, no transaction."
                />
                <Step
                  n="02"
                  title="Order"
                  body="A purchaser issues the order and its terms are fixed onchain before anyone can act on them. Approving one figure and paying another becomes impossible."
                />
                <Step
                  n="03"
                  title="Receive and invoice"
                  body="The requesting side confirms delivery — never whoever pays. The vendor invoices from their own portal, typing their own figure."
                />
                <Step
                  n="04"
                  title="Match and settle"
                  body="Order, receipt and invoice are compared. If they agree, the contract verifies the signatures and moves the USDC. If they don't, it reverts."
                />
              </ol>
            </div>

            {/* what makes it different */}
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              <Card
                title="Approvals are signatures"
                body="Not rows in our database. The contract recovers each one and counts it against an onchain approver set before releasing anything."
              />
              <Card
                title="Vendors are screened"
                body="Every payout address is checked across three chains via The Graph. Blocked vendors leave the onchain allowlist, so screening is a rule the chain keeps."
              />
              <Card
                title="The books reconcile"
                body="Double-entry throughout. GR/IR clearing nets to zero only when what arrived and what was invoiced agree — so the exception report can't be ignored."
              />
            </div>

            <div className="mt-12 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                What the contract will not do
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-600">
                It cannot verify that goods arrived or that an invoice is
                genuine — those are assertions the approvers sign{" "}
                <em>about</em>. What it enforces is that the approvers this
                organisation registered, in sufficient number, signed for
                exactly this payee and this amount against this order, once,
                within budget, to a screened vendor.
              </p>
            </div>
          </main>

          {/* ── organisations ─────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {!user ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                  Get started
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                  Sign in with your email. A wallet is created for you
                  automatically — no seed phrase, no extension, nothing to
                  install.
                </p>
                <div className="mt-4">
                  <SignInButton />
                </div>
                <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] leading-relaxed text-slate-500">
                  Create an organisation, or sign in with the address you
                  were invited on to see the invitation waiting for you.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                      Your organisations
                    </h2>
                    {orgs.length > 0 && <CreateOrg variant="inline" />}
                  </div>

                  {orgs.length === 0 && invitations.length === 0 ? (
                    <>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                        You don&apos;t belong to one yet. Creating an
                        organisation sets up a treasury wallet and a starter
                        chart of accounts.
                      </p>
                      <CreateOrg variant="empty" />
                    </>
                  ) : orgs.length === 0 ? (
                    <p className="mt-1.5 text-[13px] text-slate-600">
                      Accept an invitation below to join one.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {orgs.map((org) => (
                        <li key={org.id}>
                          <Link
                            href={`/o/${org.slug}`}
                            className="group block rounded-lg border border-slate-200 p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[14px] font-medium text-slate-900">
                                {org.name}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ROLE_TONE[org.orgRole]}`}
                              >
                                {titleCase(org.orgRole)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                              <span>
                                {org._count.departments} department
                                {org._count.departments === 1 ? "" : "s"}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>
                                {org._count.members} member
                                {org._count.members === 1 ? "" : "s"}
                              </span>
                              <span className="ml-auto text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
                                Open →
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {invitations.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
                    <h2 className="text-[13px] font-semibold tracking-tight text-indigo-900">
                      {invitations.length} invitation
                      {invitations.length === 1 ? "" : "s"} waiting
                    </h2>
                    <ul className="mt-3 space-y-3">
                      {invitations.map((inv) => (
                        <li
                          key={inv.id}
                          className="rounded-lg border border-indigo-200 bg-white p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-slate-900">
                              {inv.orgName}
                            </span>
                            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                              {inv.departmentName
                                ? `${titleCase(inv.role ?? "")} · ${inv.departmentName}`
                                : titleCase(inv.orgRole)}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                            {describeRole(
                              inv.orgRole,
                              inv.role,
                              inv.departmentName,
                            )}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            From {inv.inviterName} · expires{" "}
                            {inv.expiresAt.toLocaleDateString("en-GB")}
                          </p>
                          <div className="mt-2">
                            <AcceptButtons token={inv.token} compact />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <details className="rounded-xl border border-slate-200 bg-white p-5">
                  <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                    Signed in as
                  </summary>
                  <dl className="mt-3 space-y-1.5 text-[12px]">
                    <Row label="Email" value={user.email} />
                    <Row
                      label="Wallet"
                      value={user.walletAddress ?? "provisioning…"}
                      mono
                    />
                    <Row label="Privy DID" value={user.privyDid} mono />
                  </dl>
                </details>
              </div>
            )}
          </aside>
        </div>

        <footer className="border-t border-slate-200">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12px] text-slate-500">
            <span>
              Procure — settlement in USDC on Arc, enforced by contract.
            </span>
            <span className="flex items-center gap-4">
              <span>Privy · The Graph · Arc</span>
              <a
                href="https://github.com/technicalclipper/Procure"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-900"
              >
                Source ↗
              </a>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li>
      <div className="flex items-baseline gap-2.5">
        <span className="mono text-[11px] font-semibold text-indigo-600">
          {n}
        </span>
        <span className="text-[14px] font-medium text-slate-900">{title}</span>
      </div>
      <p className="mt-1.5 pl-[26px] text-[13px] leading-relaxed text-slate-600">
        {body}
      </p>
    </li>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[13px] font-medium text-slate-900">{title}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
        {body}
      </p>
    </div>
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
