"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createRequestAction, previewChecksAction } from "../actions";
import type { CheckResult } from "@/lib/procurement/precheck";
import { formatUsd, parseUsd } from "@/lib/units";

export type DeptOption = { id: string; name: string; code: string };
export type VendorOption = {
  id: string;
  name: string;
  status: string;
  riskBand: string;
};
export type ItemOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultRate: string;
  expenseAccountCode: string | null;
};

type Line = {
  key: number;
  itemId: string;
  description: string;
  quantity: string;
  rate: string;
};

let nextKey = 1;
const blankLine = (): Line => ({
  key: nextKey++,
  itemId: "",
  description: "",
  quantity: "1",
  rate: "",
});

function safeParse(v: string): bigint {
  try {
    return parseUsd(v || "0");
  } catch {
    return 0n;
  }
}

export function RequestForm({
  slug,
  departments,
  vendors,
  items,
}: {
  slug: string;
  departments: DeptOption[];
  vendors: VendorOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [vendorId, setVendorId] = useState("");
  const [justification, setJustification] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [approvalsRequired, setApprovalsRequired] = useState(0);

  const total = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + safeParse(l.rate) * BigInt(Math.max(1, Number(l.quantity) || 1)),
        0n,
      ),
    [lines],
  );

  // Pre-checks run as the form changes, so a request that could never be
  // paid is caught here rather than after an approver has signed it.
  useEffect(() => {
    if (!departmentId || !vendorId) {
      setChecks([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await previewChecksAction(
        slug,
        departmentId,
        vendorId,
        (Number(total) / 1_000_000).toString(),
      );
      setChecks(r.checks);
      setApprovalsRequired(r.approvalsRequired);
    }, 350);
    return () => clearTimeout(t);
  }, [slug, departmentId, vendorId, total]);

  function applyItem(key: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              itemId,
              description: item ? item.name : l.description,
              rate: item ? item.defaultRate : l.rate,
            }
          : l,
      ),
    );
  }

  const blocked = checks.some((c) => !c.passed);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap gap-4">
          <Field label="Department">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-52 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {departments.length === 0 && <option value="">No departments</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Vendor">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-64 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.status !== "ACTIVE" ? " — not payable" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Item</Th>
              <Th>Description</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit rate</Th>
              <Th align="right">Amount</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const qty = Math.max(1, Number(l.quantity) || 1);
              const amount = safeParse(l.rate) * BigInt(qty);
              const item = items.find((i) => i.id === l.itemId);
              return (
                <tr key={l.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <select
                      value={l.itemId}
                      onChange={(e) => applyItem(l.key, e.target.value)}
                      className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px]"
                    >
                      <option value="">— free text —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code}
                        </option>
                      ))}
                    </select>
                    {item?.expenseAccountCode && (
                      <div className="mono mt-1 text-[10px] text-slate-400">
                        → {item.expenseAccountCode}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      value={l.description}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) =>
                            x.key === l.key
                              ? { ...x, description: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="What is being bought"
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      value={l.quantity}
                      inputMode="numeric"
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) =>
                            x.key === l.key
                              ? { ...x, quantity: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className="tabular w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">
                        $
                      </span>
                      <input
                        value={l.rate}
                        inputMode="decimal"
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((x) =>
                              x.key === l.key ? { ...x, rate: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="0.00"
                        className="tabular w-28 rounded-md border border-slate-300 py-1 pl-5 pr-2 text-right text-[12px]"
                      />
                    </div>
                    {item && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        per {item.unit}
                      </div>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right align-top text-slate-900">
                    {formatUsd(amount)}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines((ls) => ls.filter((x) => x.key !== l.key))
                        }
                        className="text-[12px] text-slate-400 hover:text-red-700"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className="px-3 py-2" colSpan={4}>
                <button
                  type="button"
                  onClick={() => setLines((ls) => [...ls, blankLine()])}
                  className="text-[12px] text-indigo-600 hover:underline"
                >
                  + Add line
                </button>
              </td>
              <td className="tabular px-3 py-2 text-right font-semibold text-slate-900">
                {formatUsd(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pre-checks */}
      {checks.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-slate-900">
              Pre-checks
            </div>
            <div className="text-[11px] text-slate-500">
              {approvalsRequired === 0
                ? "Under threshold — approved automatically"
                : `Needs ${approvalsRequired} approval${approvalsRequired === 1 ? "" : "s"}`}
            </div>
          </div>
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.key} className="flex gap-2 text-[12px]">
                <span
                  className={c.passed ? "text-emerald-600" : "text-red-600"}
                >
                  {c.passed ? "✓" : "✕"}
                </span>
                <span className="text-slate-500">
                  <span className="font-medium text-slate-800">{c.label}</span>{" "}
                  — {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <Field label="Justification" hint="optional">
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={2}
            placeholder="Why is this needed?"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || blocked || total <= 0n || !vendorId}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("departmentId", departmentId);
              fd.set("vendorId", vendorId);
              fd.set("justification", justification);
              fd.set(
                "lines",
                JSON.stringify(
                  lines.map((l) => ({
                    itemId: l.itemId || null,
                    description: l.description,
                    quantity: l.quantity,
                    rate: l.rate,
                  })),
                ),
              );
              const r = await createRequestAction(slug, fd);
              if (r.ok) router.push(`/o/${slug}/requests/${r.id}`);
              else {
                setError(r.error);
                if (r.checks) setChecks(r.checks);
              }
            })
          }
          className="rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
        <span className="text-[12px] text-slate-500">
          {blocked
            ? "Resolve the failing pre-check first."
            : total > 0n
              ? `Total ${formatUsd(total)}`
              : "Add a line to continue."}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
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
