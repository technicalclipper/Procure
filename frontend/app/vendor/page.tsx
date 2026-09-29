import Link from "next/link";
import { POStatus, VendorPortalStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { formatUsd } from "@/lib/units";
import { SignInButton, SyncOnLogin } from "@/app/auth-buttons";
import { VendorShell } from "./shell";

export const dynamic = "force-dynamic";

const STATUS: Record<POStatus, { label: string; tone: string }> = {
  ISSUED: {
    label: "Needs your response",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  VENDOR_ACCEPTED: {
    label: "Accepted",
    tone: "bg-teal-50 text-teal-800 ring-teal-600/20",
  },
  VENDOR_REJECTED: {
    label: "You rejected",
    tone: "bg-red-50 text-red-700 ring-red-600/20",
  },
  RECEIVED: {
    label: "Delivery confirmed",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  CLOSED: { label: "Closed", tone: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  CANCELLED: {
    label: "Cancelled",
    tone: "bg-slate-100 text-slate-500 ring-slate-500/20",
  },
};

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
    include: {
      org: { select: { name: true } },
      orders: {
        include: {
          receipt: { select: { id: true } },
          invoice: { select: { id: true } },
          bill: { select: { payment: { select: { status: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  if (vendors.length === 0) {
    return (
      <VendorShell user={user}>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-[13px] font-medium text-slate-900">
            No portal access yet
          </div>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500">
            You&apos;re signed in as{" "}
            <span className="font-medium">{user.email}</span>, but no customer
            has invited that address. Ask your contact to send a portal link.
          </p>
        </div>
      </VendorShell>
    );
  }

  const awaiting = vendors
    .flatMap((v) => v.orders)
    .filter((o) => o.status === POStatus.ISSUED).length;

  return (
    <>
      <SyncOnLogin signedIn />
      <VendorShell user={user}>
        <header className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight">
              Your orders
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Purchase orders sent to you, and where each one stands.
            </p>
          </div>
          {awaiting > 0 && (
            <div className="shrink-0 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
              {awaiting} need{awaiting === 1 ? "s" : ""} your response
            </div>
          )}
        </header>

        <div className="space-y-6">
          {vendors.map((v) => (
            <section key={v.id}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[13px] font-medium text-slate-900">
                  {v.org.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  you trade as {v.name} · {v.paymentTerms} · paid to{" "}
                  <a
                    href={explorerAddress(v.payoutAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-teal-700 hover:underline"
                  >
                    {shortAddress(v.payoutAddress)} ↗
                  </a>
                </div>
              </div>

              {v.orders.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-[12px] text-slate-500">
                  No purchase orders yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {v.orders.map((o) => {
                    const st = STATUS[o.status];
                    const paid = o.bill?.payment?.status === "CONFIRMED";
                    return (
                      <li key={o.id}>
                        <Link
                          href={`/vendor/orders/${o.id}`}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-teal-300 hover:bg-teal-50/30"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="mono text-[13px] font-medium text-slate-900">
                                {o.poNumber}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                                  paid
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : st.tone
                                }`}
                              >
                                {paid ? "Paid" : st.label}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                              <Step done label="Issued" />
                              <Step
                                done={o.status !== POStatus.ISSUED}
                                label="Accepted"
                              />
                              <Step done={!!o.receipt} label="Delivered" />
                              <Step done={!!o.invoice} label="Invoiced" />
                              <Step done={paid} label="Paid" />
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="tabular text-[15px] font-semibold text-slate-900">
                              {formatUsd(o.amountMinor)}
                            </div>
                            <div className="text-[11px] text-teal-700">
                              Open →
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      </VendorShell>
    </>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={
        done
          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
          : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-400"
      }
    >
      {done ? "✓" : "○"} {label}
    </span>
  );
}
