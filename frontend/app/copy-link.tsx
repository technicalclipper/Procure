"use client";

import { useState } from "react";

/**
 * Selectable, copyable link.
 *
 * Every invitation flow shows one. Provider-level delivery is outside our
 * control — an unverified sending domain, a spam filter, a bounce — and
 * none of that should block onboarding someone.
 */
export function CopyLink({
  link,
  tone = "emerald",
}: {
  link: string;
  tone?: "emerald" | "slate";
}) {
  const [copied, setCopied] = useState(false);

  const border = tone === "emerald" ? "border-emerald-300" : "border-slate-300";
  const button =
    tone === "emerald"
      ? "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
      : "border-slate-300 text-slate-700 hover:bg-slate-50";

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className={`mono min-w-0 flex-1 rounded border ${border} bg-white px-2 py-1 text-[11px] text-slate-700`}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard can be blocked by permissions; the field is
            // selectable either way.
          }
        }}
        className={`shrink-0 rounded border bg-white px-2 py-1 text-[11px] font-medium ${button}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
