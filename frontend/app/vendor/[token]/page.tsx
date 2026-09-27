import Link from "next/link";
import { VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { SignInButton, SyncOnLogin } from "@/app/auth-buttons";
import { ClaimPortal } from "./claim";

export const dynamic = "force-dynamic";

export default async function VendorPortalClaim({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [vendor, user] = await Promise.all([
    db.vendor.findUnique({
      where: { portalToken: token },
      include: { org: { select: { name: true } } },
    }),
    getSessionUser(),
  ]);

  if (!vendor) {
    return (
      <Shell>
        <Card>
          <h1 className="text-[19px] font-semibold tracking-tight">
            This portal link isn&apos;t valid
          </h1>
          <p className="mt-2 text-[13px] text-slate-600">
            It may have been replaced by a newer invitation, or access may
            have been revoked. Ask your contact to send a fresh link.
          </p>
        </Card>
      </Shell>
    );
  }

  const summary = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
        Vendor portal
      </div>
      <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
        {vendor.org.name} wants to send you purchase orders
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
        You&apos;ve been set up as{" "}
        <span className="font-medium text-slate-900">{vendor.name}</span>.
        Payments will arrive at{" "}
        <a
          href={explorerAddress(vendor.payoutAddress)}
          target="_blank"
          rel="noreferrer"
          className="mono text-indigo-600 hover:underline"
        >
          {shortAddress(vendor.payoutAddress)} ↗
        </a>
      </p>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          In the portal you can
        </div>
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-slate-600">
          <li>· See purchase orders sent to you</li>
          <li>· Accept, reject or comment on them</li>
          <li>· Submit an invoice against an accepted order</li>
          <li>· Track payment and download the remittance advice</li>
        </ul>
        <div className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
          You won&apos;t see their budgets, other suppliers, or anything
          internal — only what concerns your own orders.
        </div>
      </div>
    </>
  );

  if (vendor.portalStatus === VendorPortalStatus.ACTIVE) {
    const mine = user && vendor.portalUserId === user.id;
    return (
      <Shell>
        <Card>
          {summary}
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
            {mine
              ? "You've already claimed this portal."
              : "This portal has already been claimed."}
          </div>
          {mine && (
            <Link
              href="/vendor"
              className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
            >
              Go to my orders
            </Link>
          )}
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <SyncOnLogin signedIn={false} />
        <Card>
          {summary}
          <div className="mt-6">
            <SignInButton />
            <p className="mt-3 text-[12px] text-slate-500">
              Sign in with <strong>{vendor.email}</strong> — the address this
              invitation was sent to.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (user.email.toLowerCase() !== vendor.email.toLowerCase()) {
    return (
      <Shell>
        <Card>
          {summary}
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            This invitation is for{" "}
            <span className="font-medium">{vendor.email}</span>, but
            you&apos;re signed in as{" "}
            <span className="font-medium">{user.email}</span>. Sign out and
            sign back in with the invited address.
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        {summary}
        <div className="mt-6">
          <ClaimPortal token={token} />
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
