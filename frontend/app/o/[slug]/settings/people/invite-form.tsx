"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  inviteAction,
  previewInvitationAction,
  revokeInvitationAction,
  type ActionState,
} from "./actions";
import { describeRole, renderInvitationEmail } from "@/lib/mail/templates";

export type DeptOption = { id: string; name: string; code: string };

const ORG_ROLES = [
  { value: "MEMBER", label: "Member", note: "belongs to the org; powers come from their department role" },
  { value: "CONTROLLER", label: "Controller", note: "manages departments, budgets, master data and vendors" },
];

const DEPT_ROLES = [
  { value: "", label: "— none —" },
  { value: "REQUESTER", label: "Requester" },
  { value: "PURCHASER", label: "Purchaser" },
  { value: "APPROVER", label: "Approver" },
];

export function InviteForm({
  slug,
  orgName,
  inviterName,
  inviterEmail,
  departments,
}: {
  slug: string;
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  departments: DeptOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState("MEMBER");
  const [deptRole, setDeptRole] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const departmentName =
    departments.find((d) => d.id === departmentId)?.name ?? null;

  // The preview uses the same template function the server sends, so what
  // you see here is literally what lands in their inbox.
  const preview = renderInvitationEmail({
    orgName,
    inviterName,
    inviterEmail,
    recipientEmail: email || "them@example.com",
    orgRole,
    deptRole: departmentName && deptRole ? deptRole : null,
    departmentName: deptRole ? departmentName : null,
    acceptUrl: "#preview",
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });

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
        Invite to {orgName}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Form */}
        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              const r = await inviteAction(slug, fd);
              setResult(r);
              if (r.ok) {
                formRef.current?.reset();
                setEmail("");
                setDeptRole("");
                setDepartmentId("");
                setOpen(false);
              }
            })
          }
          className="space-y-3"
        >
          <Field label="Email">
            <input
              name="email"
              required
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jo@northwind.test"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Organisation role">
            <select
              name="orgRole"
              value={orgRole}
              onChange={(e) => setOrgRole(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {ORG_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-slate-500">
              {ORG_ROLES.find((r) => r.value === orgRole)?.note}
            </div>
          </Field>

          <div className="flex gap-3">
            <Field label="Department role" hint="optional">
              <select
                name="deptRole"
                value={deptRole}
                onChange={(e) => setDeptRole(e.target.value)}
                className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {DEPT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Department">
              <select
                name="departmentId"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={!deptRole}
                required={!!deptRole}
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
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <span className="font-medium text-slate-900">They will be:</span>{" "}
            {describeRole(
              orgRole,
              deptRole ? deptRole : null,
              deptRole ? departmentName : null,
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send invitation"}
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

          {result && !result.ok && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
              {result.error}
            </div>
          )}
        </form>

        {/* Live preview — same template the server sends */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Email preview
            </div>
            <div className="text-[10px] text-slate-400">
              exactly what is sent
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <Meta label="To" value={email || "them@example.com"} />
              <Meta label="Subject" value={preview.subject} />
            </div>
            <iframe
              title="Invitation email preview"
              srcDoc={preview.html}
              sandbox=""
              className="h-[420px] w-full bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RevokeInvitation({ slug, id }: { slug: string; id: string }) {
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
            const r = await revokeInvitationAction(slug, fd);
            setError(r.ok ? null : (r.error ?? "Failed"));
          })
        }
        className="text-[12px] text-slate-500 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-40"
      >
        {pending ? "…" : "Revoke"}
      </button>
      {error && <div className="mt-1 text-[11px] text-red-700">{error}</div>}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-5">
      <span className="w-12 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-slate-700">{value}</span>
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
