"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useSignTypedData } from "@privy-io/react-auth";
import { decideAction, type DecisionState } from "./approve-actions";

/**
 * Approving is signing.
 *
 * The approver's own Privy wallet signs an EIP-712 struct naming the
 * order, the amount and the level. That signature is what the contract
 * recovers at payment — so an approval is a thing only the approver's
 * key could have produced, not a row our server could have written.
 *
 * Rejection isn't signed. There is nothing to authorise, and demanding
 * a signature to say no would be friction in the direction we least
 * want it.
 */
export function DecisionPanel({
  slug,
  requestId,
  levelLabel,
  remaining,
  typedData,
}: {
  slug: string;
  requestId: string;
  levelLabel: string;
  remaining: number;
  /// Serialised on the server — BigInt can't cross the boundary, and the
  /// digest must be built from the contract's own domain.
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, string | number>;
  } | null;
}) {
  const router = useRouter();
  const { signTypedData } = useSignTypedData();
  const [pending, start] = useTransition();
  const [signing, setSigning] = useState(false);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<DecisionState | null>(null);

  const decide = (approved: boolean) => {
    setResult(null);
    start(async () => {
      let signature: string | null = null;

      if (approved && typedData) {
        setSigning(true);
        try {
          const out = await signTypedData(typedData as never);
          signature =
            typeof out === "string"
              ? out
              : (out as { signature: string }).signature;
          if (!signature) throw new Error("Wallet returned no signature.");
        } catch (e) {
          setSigning(false);
          const message = e instanceof Error ? e.message : String(e);
          // Log the raw error — the wallet's own wording is the only
          // thing that says which part of the payload it disliked, and
          // a tidied-up message would throw that away.
          console.error("[approve] signTypedData failed", e, typedData);
          setResult({
            ok: false,
            error: /reject|denied|cancel|closed/i.test(message)
              ? "You cancelled the signature — nothing was recorded."
              : `Your wallet wouldn't sign this: ${message}`,
          });
          return;
        }
        setSigning(false);
      }

      const r = await decideAction(slug, requestId, approved, comment, signature);
      setResult(r);
      if (r.ok) {
        setComment("");
        router.refresh();
      }
    });
  };

  const busy = pending || signing;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="text-[13px] font-medium text-indigo-900">
        This is waiting on you
      </div>
      <p className="mt-0.5 text-[12px] text-indigo-800">
        {levelLabel}
        {remaining > 1 &&
          ` · ${remaining} more signature${remaining === 2 ? "" : "s"} needed after yours`}
      </p>

      {typedData && (
        <p className="mt-2 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
          Approving asks your wallet to sign. It costs nothing and sends no
          transaction — the signature is what Arc checks before the money
          moves, so a payment nobody signed for cannot happen.
        </p>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Comment — required if you reject"
        className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {signing
            ? "Waiting for your signature…"
            : pending
              ? "Recording…"
              : typedData
                ? "Sign and approve"
                : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy || comment.trim().length === 0}
          title={
            comment.trim().length === 0
              ? "Give a reason before rejecting"
              : undefined
          }
          onClick={() => decide(false)}
          className="rounded-md border border-red-300 bg-white px-3 py-2 text-[13px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Reject
        </button>
      </div>

      {result?.ok && result.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {result.message}
        </div>
      )}
      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
