"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitationAction, declineInvitationAction } from "./actions";

export function AcceptButtons({
  token,
  compact,
}: {
  token: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await acceptInvitationAction(token);
              if (r.ok) router.push(`/o/${r.slug}`);
              else setError(r.error);
            })
          }
          className={
            compact
              ? "rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              : "rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          }
        >
          {pending ? "Joining…" : "Accept & join"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await declineInvitationAction(token);
              if (r.ok) router.refresh();
              else setError(r.error ?? "Failed");
            })
          }
          className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-40"
        >
          Decline
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
