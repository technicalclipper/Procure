"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimVendorPortalAction } from "./actions";

export function ClaimPortal({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await claimVendorPortalAction(token);
            if (r.ok) router.push("/vendor");
            else setError(r.error);
          })
        }
        className="rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Accept & open portal"}
      </button>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
