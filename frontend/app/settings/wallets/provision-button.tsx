"use client";

import { useState, useTransition } from "react";
import { provisionAction, type ActionState } from "./actions";

export function ProvisionButton({ missing }: { missing: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState & { created?: string[] } | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await provisionAction());
          })
        }
        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending
          ? "Provisioning…"
          : `Provision ${missing} wallet${missing === 1 ? "" : "s"}`}
      </button>

      {result?.ok && result.created && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {result.created.length === 0 ? (
            "Nothing to do — all wallets already exist."
          ) : (
            <>
              <div className="font-medium mb-1">
                Created {result.created.length}:
              </div>
              <ul className="space-y-0.5 mono">
                {result.created.map((c: string) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
