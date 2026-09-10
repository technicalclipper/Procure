"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createOrgAction, type CreateOrgState } from "./actions";
import { slugify } from "@/lib/slug";

export function CreateOrg({ variant }: { variant: "empty" | "inline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CreateOrgState | null>(null);
  const [name, setName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className={
          variant === "empty"
            ? "mt-5 rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
            : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        }
      >
        Create organisation
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-left">
      <div className="mb-3 text-[13px] font-medium text-slate-900">
        New organisation
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await createOrgAction(fd);
            setResult(r);
            if (r.ok && r.slug) router.push(`/o/${r.slug}`);
          })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-slate-600">
            Name
          </div>
          <input
            name="name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Northwind Labs"
            className="w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </label>

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
        {name.trim() ? (
          <>
            URL will be{" "}
            <span className="mono text-slate-700">/o/{slugify(name)}</span>.{" "}
          </>
        ) : null}
        You become the owner. A treasury wallet and a starter chart of
        accounts are set up automatically.
      </p>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
