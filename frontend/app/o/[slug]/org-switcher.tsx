"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type OrgOption = {
  slug: string;
  name: string;
  orgRole: string;
};

export function OrgSwitcher({
  current,
  orgs,
}: {
  current: OrgOption;
  orgs: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — a dropdown that traps you is worse
  // than no dropdown.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100"
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {current.name}
          </span>
          <span className="block text-[11px] text-slate-500">
            {titleCase(current.orgRole)}
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Organisations
          </div>
          <ul className="max-h-64 overflow-y-auto pb-1">
            {orgs.map((o) => {
              const active = o.slug === current.slug;
              return (
                <li key={o.slug}>
                  <Link
                    href={`/o/${o.slug}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] ${
                      active
                        ? "bg-indigo-50 font-medium text-indigo-700"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 truncate">{o.name}</span>
                    {active ? (
                      <span className="shrink-0 text-[11px]">✓</span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {titleCase(o.orgRole)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-slate-100">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
            >
              ← All organisations
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
