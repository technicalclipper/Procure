"use client";

import { useRef, useState, useTransition } from "react";
import {
  inviteUserAction,
  addRoleAction,
  removeRoleAction,
  provisionUserWalletAction,
  type ActionState,
} from "./actions";

export type DeptOption = { id: string; name: string; code: string };

const ROLES = [
  { value: "REQUESTER", label: "Requester", note: "raises purchase requests" },
  { value: "APPROVER", label: "Approver", note: "signs off; counts toward quorum" },
  { value: "CONTROLLER", label: "Controller", note: "org-wide; masters and budgets" },
];

export function InviteUser({ departments }: { departments: DeptOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [role, setRole] = useState("REQUESTER");
  const formRef = useRef<HTMLFormElement>(null);

  const orgWide = role === "CONTROLLER";

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
          + Invite user
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
        Invite user
      </div>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const r = await inviteUserAction(fd);
            setResult(r);
            if (r.ok) {
              formRef.current?.reset();
              setOpen(false);
            }
          })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Name">
          <input
            name="name"
            required
            placeholder="Jo Requester"
            className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Email">
          <input
            name="email"
            required
            type="email"
            placeholder="jo@northwind.test"
            className="w-60 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Role">
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-40 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Department" hint={orgWide ? "all — controller" : undefined}>
          <select
            name="departmentId"
            disabled={orgWide}
            required={!orgWide}
            className="w-44 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
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
            {pending ? "Inviting…" : "Invite"}
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
        {ROLES.find((r) => r.value === role)?.note}. A Privy embedded wallet is
        provisioned automatically — approvals are signatures from that wallet,
        not database rows.
      </p>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}

export function AddRole({
  userId,
  departments,
}: {
  userId: string;
  departments: DeptOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-indigo-600 underline-offset-2 hover:underline"
      >
        + role
      </button>
    );
  }

  return (
    <div>
      <form
        action={(fd) =>
          start(async () => {
            fd.set("userId", userId);
            const r = await addRoleAction(fd);
            if (r.ok) {
              setOpen(false);
              setError(null);
            } else setError(r.error ?? "Failed");
          })
        }
        className="flex items-center gap-1.5"
      >
        <select
          name="role"
          defaultValue="APPROVER"
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          name="departmentId"
          required
          defaultValue=""
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
        >
          <option value="">Dept…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "…" : "Add"}
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

export function RemoveRole({ membershipId }: { membershipId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Remove role"
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("membershipId", membershipId);
            const r = await removeRoleAction(fd);
            setError(r.ok ? null : (r.error ?? "Failed"));
          })
        }
        className="ml-1 text-slate-400 hover:text-red-700 disabled:opacity-40"
      >
        ✕
      </button>
      {error && (
        <div className="mt-1 max-w-sm text-[11px] text-red-700">{error}</div>
      )}
    </>
  );
}

export function ProvisionUserWallet({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("userId", userId);
          await provisionUserWalletAction(fd);
        })
      }
      className="text-[11px] text-indigo-600 underline-offset-2 hover:underline disabled:opacity-40"
    >
      {pending ? "…" : "Provision"}
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
