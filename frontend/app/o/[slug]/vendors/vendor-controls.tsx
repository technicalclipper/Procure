"use client";

import { useRef, useState, useTransition } from "react";
import {
  createVendorAction,
  setVendorStatusAction,
  type ActionState,
} from "./actions";

export type ApAccountOption = { code: string; name: string };

const TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Due on receipt"];

export function AddVendor({
  slug,
  apAccounts,
}: {
  slug: string;
  apAccounts: ApAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [address, setAddress] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const addressLooksValid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  const addressTouched = address.trim().length > 0;

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setResult(null);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add vendor
        </button>
        {result?.ok && result.message && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
            {result.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-[13px] font-medium text-slate-900">
        New vendor
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createVendorAction(slug, fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setAddress("");
              setOpen(false);
            }
          })
        }
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input
              name="name"
              required
              autoFocus
              placeholder="Northwind Cloud"
              className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Email" hint="where the PO goes">
            <input
              name="email"
              required
              type="email"
              placeholder="ap@northwind.test"
              className="w-60 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Payment terms">
            <select
              name="paymentTerms"
              defaultValue="Net 30"
              className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Payout address" hint="USDC on Arc">
          <input
            name="payoutAddress"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className={`mono w-full max-w-xl rounded-md border px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 ${
              addressTouched && !addressLooksValid
                ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
            }`}
          />
          {addressTouched && !addressLooksValid && (
            <div className="mt-1 text-[11px] text-red-700">
              Needs to be 0x followed by 40 hex characters.
            </div>
          )}
        </Field>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Category" hint="optional">
            <input
              name="category"
              placeholder="Infrastructure"
              className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="AP account" hint="optional override">
            <select
              name="apAccountCode"
              defaultValue=""
              className="w-64 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— default payables —</option>
              {apAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add vendor"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              className="rounded-md px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Vendors are created as <strong>draft</strong>. Nothing can be paid to
          an address until it has been screened and activated — that is the
          gate the whole payment path depends on.
        </p>
      </form>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function VendorStatusControl({
  slug,
  id,
  status,
}: {
  slug: string;
  id: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(next: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", next);
      const r = await setVendorStatusAction(slug, fd);
      setError(r.ok ? null : (r.error ?? "Failed"));
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status !== "ACTIVE" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("ACTIVE")}
          className="text-[12px] text-emerald-700 underline-offset-2 hover:underline disabled:opacity-40"
        >
          {pending ? "…" : "Activate"}
        </button>
      )}
      {status !== "BLOCKED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("BLOCKED")}
          className="text-[12px] text-slate-500 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-40"
        >
          Block
        </button>
      )}
      {status === "BLOCKED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("DRAFT")}
          className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-40"
        >
          Unblock
        </button>
      )}
      {error && <div className="text-[11px] text-red-700">{error}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium text-slate-600">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
