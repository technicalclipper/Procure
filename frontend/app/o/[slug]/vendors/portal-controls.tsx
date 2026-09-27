"use client";

import { useState, useTransition } from "react";
import {
  inviteVendorPortalAction,
  revokeVendorPortalAction,
  type PortalActionState,
} from "./portal-actions";
import { CopyLink } from "@/app/copy-link";

export function PortalControls({
  slug,
  vendorId,
  status,
  email,
  invitedAt,
  activatedAt,
}: {
  slug: string;
  vendorId: string;
  status: string;
  email: string;
  invitedAt: string | null;
  activatedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PortalActionState | null>(null);

  const run = (fn: () => Promise<PortalActionState>) =>
    start(async () => setResult(await fn()));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-slate-900">
            Vendor portal
          </div>
          <p className="mt-1 max-w-md text-[12px] text-slate-500">
            {status === "ACTIVE"
              ? `${email} has claimed the portal and can see their orders, accept or reject them, and submit invoices.`
              : status === "INVITED"
                ? `Invitation sent to ${email}. They become active once they sign in with that address.`
                : `Invite ${email} so they can receive purchase orders, accept them and submit invoices.`}
          </p>
          <div className="mt-1.5 text-[11px] text-slate-400">
            {activatedAt
              ? `Claimed ${new Date(activatedAt).toLocaleString("en-GB")}`
              : invitedAt
                ? `Invited ${new Date(invitedAt).toLocaleString("en-GB")}`
                : "Not invited yet"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <PortalStatusPill status={status} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {status !== "ACTIVE" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => inviteVendorPortalAction(slug, vendorId))}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending
              ? "Sending…"
              : status === "INVITED"
                ? "Resend invitation"
                : "Invite to portal"}
          </button>
        )}

        {status !== "NOT_INVITED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => revokeVendorPortalAction(slug, vendorId))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Revoke access
          </button>
        )}
      </div>

      {status === "INVITED" && (
        <p className="mt-2 text-[11px] text-slate-400">
          Resending rotates the link — any earlier invitation stops working.
        </p>
      )}

      {result?.ok && result.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          <div>{result.message}</div>
          {result.link && <CopyLink link={result.link} />}
        </div>
      )}
      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function PortalStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    ACTIVE: {
      label: "Active",
      tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    },
    INVITED: {
      label: "Invited",
      tone: "bg-amber-50 text-amber-800 ring-amber-600/20",
    },
    NOT_INVITED: {
      label: "Not invited",
      tone: "bg-slate-100 text-slate-500 ring-slate-500/20",
    },
  };
  const s = map[status] ?? map.NOT_INVITED;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.tone}`}
    >
      {s.label}
    </span>
  );
}
