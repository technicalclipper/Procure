import Link from "next/link";
import { VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { SignInButton, SignOutButton, SyncOnLogin } from "@/app/auth-buttons";

export const dynamic = "force-dynamic";

export default async function VendorPortalHome() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <SyncOnLogin signedIn={false} />
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-8">
          <div className="rounded-xl border border-slate-200 bg-white p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
              Procure · Vendor portal
            </div>
            <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-slate-900">
              Sign in to see your orders
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              Use the email address your customer invited. If you haven&apos;t
              been invited yet, ask them for a portal link.
            </p>
            <div className="mt-6">
              <SignInButton />
            </div>
          </div>
        </main>
      </>
    );
  }

  const vendors = await db.vendor.findMany({
    where: { portalUserId: user.id, portalStatus: VendorPortalStatus.ACTIVE },
    include: { org: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <SyncOnLogin signedIn />
      <div className="min-h-screen bg-slate-50">
        {/*
          Deliberately not the org chrome. A vendor is outside the buying
          organisation, and the switch between the two views has to be
          unmistakable at a glance.
        */}
        <header className="border-b border-teal-200 bg-teal-50">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                Vendor portal
              </div>
              <div className="text-[19px] font-semibold tracking-tight text-slate-900">
                Procure
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
                    className="mono text-[11px] text-teal-700 hover:underline"
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
          {vendors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <div className="text-[13px] font-medium text-slate-900">
                No portal access yet
              </div>
              <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500">
                You&apos;re signed in as{" "}
                <span className="font-medium">{user.email}</span>, but no
                customer has invited that address. Ask your contact to send a
                portal link.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block text-[12px] text-teal-700 underline-offset-2 hover:underline"
              >
                Go to Procure
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-[19px] font-semibold tracking-tight">
                Your customers
              </h1>
              <p className="mt-1 text-[13px] text-slate-500">
                Purchase orders sent to you appear here.
              </p>

              <ul className="mt-6 space-y-2">
                {vendors.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-slate-900">
                          {v.org.name}
                        </div>
                        <div className="text-[12px] text-slate-500">
                          You trade as{" "}
                          <span className="font-medium text-slate-700">
                            {v.name}
                          </span>{" "}
                          · {v.paymentTerms}
                        </div>
                        <a
                          href={explorerAddress(v.payoutAddress)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono mt-1 inline-block text-[11px] text-teal-700 hover:underline"
                          title={v.payoutAddress}
                        >
                          paid to {shortAddress(v.payoutAddress)} ↗
                        </a>
                      </div>
                      <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-inset ring-teal-600/20">
                        Portal active
                      </span>
                    </div>

                    <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">
                      No purchase orders yet. When {v.org.name} issues one,
                      it appears here for you to accept, reject or comment on.
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </div>
    </>
  );
}
