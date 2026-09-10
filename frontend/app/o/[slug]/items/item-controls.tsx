"use client";

import { useRef, useState, useTransition } from "react";
import { createItemAction, toggleItemAction, type ActionState } from "./actions";

export type AccountOption = { id: string; code: string; name: string };

export function AddItem({
  slug,
  accounts,
}: {
  slug: string;
  accounts: AccountOption[];
}) {
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
          + Add item
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
      <div className="mb-3 text-[13px] font-medium text-slate-900">New item</div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createItemAction(slug, fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setOpen(false);
            }
          })
        }
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Code">
            <input
              name="code"
              required
              autoFocus
              placeholder="TRAVEL"
              maxLength={20}
              className="mono w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Name">
            <input
              name="name"
              required
              placeholder="Business travel"
              className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Unit">
            <input
              name="unit"
              placeholder="trip"
              className="w-28 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Default rate" hint="per unit">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">
                $
              </span>
              <input
                name="rate"
                inputMode="decimal"
                placeholder="0.00"
                className="tabular w-32 rounded-md border border-slate-300 py-1.5 pl-6 pr-2.5 text-right text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Expense account" hint="drives GL coding">
            <select
              name="accountId"
              defaultValue=""
              className="w-72 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— none, code manually —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category" hint="optional">
            <input
              name="category"
              placeholder="Travel"
              className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Description" hint="optional">
            <input
              name="description"
              placeholder="Flights, rail, hotels"
              className="w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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

export function ToggleItem({
  slug,
  id,
  active,
}: {
  slug: string;
  id: string;
  active: boolean;
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
          await toggleItemAction(slug, fd);
        })
      }
      className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-40"
    >
      {pending ? "…" : active ? "Deactivate" : "Reactivate"}
    </button>
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
