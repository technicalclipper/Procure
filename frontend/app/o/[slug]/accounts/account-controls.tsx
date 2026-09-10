"use client";

import { useRef, useState, useTransition } from "react";
import {
  createAccountAction,
  toggleAccountAction,
  type ActionState,
} from "./actions";

const TYPES = [
  { value: "ASSET", label: "Asset", range: "1000–1999" },
  { value: "LIABILITY", label: "Liability", range: "2000–2999" },
  { value: "EQUITY", label: "Equity", range: "3000–3999" },
  { value: "INCOME", label: "Income", range: "4000–4999" },
  { value: "EXPENSE", label: "Expense", range: "5000–6999" },
];

export function AddAccount({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [type, setType] = useState("EXPENSE");
  const formRef = useRef<HTMLFormElement>(null);

  const range = TYPES.find((t) => t.value === type)?.range;

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
          + Add account
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
        New account
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createAccountAction(slug, fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setOpen(false);
            }
          })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Type">
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Code" hint={range}>
          <input
            name="code"
            required
            inputMode="numeric"
            placeholder="5400"
            className="mono w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Name">
          <input
            name="name"
            required
            placeholder="Equipment Expense"
            className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Subtype" hint="optional">
          <input
            name="subtype"
            placeholder="Operating"
            className="w-36 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
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

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function ToggleAccount({
  slug,
  id,
  active,
}: {
  slug: string;
  id: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("id", id);
            const r = await toggleAccountAction(slug, fd);
            setError(r.ok ? null : (r.error ?? "Failed"));
          })
        }
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-40"
      >
        {pending ? "…" : active ? "Deactivate" : "Reactivate"}
      </button>
      {error && (
        <div className="mt-1 max-w-xs text-[11px] text-red-700">{error}</div>
      )}
    </>
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
