"use client";

import { useRef, useState, useTransition } from "react";
import {
  createDepartmentAction,
  updateBudgetAction,
  provisionDepartmentWalletAction,
  provisionTreasuryAction,
  type ActionState,
} from "./actions";

export function AddDepartment({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-[13px] font-medium text-slate-900">
        New department
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createDepartmentAction(slug, fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setOpen(false);
            }
          })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Name" hint="e.g. Engineering">
          <input
            name="name"
            required
            autoFocus
            placeholder="Engineering"
            className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Code" hint="2–6 chars">
          <input
            name="code"
            required
            placeholder="ENG"
            maxLength={6}
            className="mono w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Budget" hint="per period">
          <MoneyInput name="budget" placeholder="50,000" />
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
        A cash account is added to the chart of accounts and a Privy server
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

export function EditBudget({
  slug,
  id,
  current,
}: {
  slug: string;
  id: string;
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-indigo-600 underline-offset-2 hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <div>
      <form
        action={(fd) =>
          start(async () => {
            fd.set("id", id);
            const r = await updateBudgetAction(slug, fd);
            if (r.ok) {
              setOpen(false);
              setError(null);
            } else setError(r.error ?? "Failed");
          })
        }
        className="flex items-center justify-end gap-1.5"
      >
        <MoneyInput name="budget" defaultValue={current} width="w-28" small />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="px-1 text-[11px] text-slate-500 hover:text-slate-800"
        >
          ✕
        </button>
      </form>
      {error && <div className="mt-1 text-[11px] text-red-700">{error}</div>}
    </div>
  );
}

export function ProvisionDepartmentWallet({
  slug,
  id,
}: {
  slug: string;
  id: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await provisionDepartmentWalletAction(slug, fd);
        })
      }
      className="text-[11px] text-indigo-600 underline-offset-2 hover:underline disabled:opacity-40"
    >
      {pending ? "…" : "Provision"}
    </button>
  );
}

export function ProvisionTreasury({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await provisionTreasuryAction(slug);
            setError(r.ok ? null : (r.error ?? "Failed"));
          })
        }
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Provisioning…" : "Provision treasury wallet"}
      </button>
      {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
    </>
  );
}

function MoneyInput({
  name,
  placeholder,
  defaultValue,
  width = "w-36",
  small,
}: {
  name: string;
  placeholder?: string;
  defaultValue?: string;
  width?: string;
  small?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 ${small ? "text-[11px]" : "text-[13px]"}`}
      >
        $
      </span>
      <input
        name={name}
        required
        inputMode="decimal"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={`tabular ${width} rounded-md border border-slate-300 pl-5 pr-2 text-right outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${
          small ? "py-1 text-[11px]" : "py-1.5 text-[13px]"
        }`}
      />
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
