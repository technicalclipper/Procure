"use client";

import { useRef, useState, useTransition } from "react";
import { createDepartmentAction, type ActionState } from "./actions";

export function AddDepartment() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setResult(null);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add department
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
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-[13px] font-medium text-slate-900">
        New department
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createDepartmentAction(fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setOpen(false);
            }
          })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Name" hint="e.g. Design">
          <input
            name="name"
            required
            placeholder="Design"
            className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Code" hint="2–6 chars">
          <input
            name="code"
            required
            placeholder="DSN"
            maxLength={6}
            className="mono w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Budget" hint="per period, USDC">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">
              $
            </span>
            <input
              name="budget"
              required
              inputMode="decimal"
              placeholder="25,000"
              className="tabular w-36 rounded-md border border-slate-300 py-1.5 pl-6 pr-2.5 text-right text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </Field>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create"}
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
      </form>

      <p className="mt-3 text-[11px] text-slate-500">
        A cash account is created in the chart of accounts and a Privy server
        wallet is provisioned automatically.
      </p>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
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
