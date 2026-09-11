"use client";

import { useRef, useState, useTransition } from "react";
import {
  addLevelAction,
  removeLevelAction,
  setFlowEnabledAction,
  setLevelApproversAction,
  type FlowActionState,
} from "./actions";

export type MemberOption = { id: string; label: string };

export type LevelView = {
  id: string;
  position: number;
  name: string | null;
  rule: string;
  minAmount: string;
  mode: string;
  quorumCount: number;
  approverIds: string[];
};

export function FlowEditor({
  slug,
  module,
  title,
  description,
  enabled,
  levels,
  members,
}: {
  slug: string;
  module: string;
  title: string;
  description: string;
  enabled: boolean;
  levels: LevelView[];
  members: MemberOption[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FlowActionState | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState("ANY_ONE");
  const formRef = useRef<HTMLFormElement>(null);

  const run = (fn: () => Promise<FlowActionState>) =>
    start(async () => setResult(await fn()));

  const emptyLevels = levels.filter((l) => l.approverIds.length === 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-slate-900">{title}</div>
          <p className="mt-0.5 max-w-lg text-[12px] text-slate-500">
            {description}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-[12px] text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(e) =>
              run(() => setFlowEnabledAction(slug, module, e.target.checked))
            }
            className="h-3.5 w-3.5"
          />
          Require approval
        </label>
      </div>

      {!enabled ? (
        <div className="px-5 py-6 text-[12px] text-slate-500">
          Approval is off for this module — anything raised is approved
          automatically. Turn it on to build a ladder.
        </div>
      ) : (
        <div className="px-5 py-4">
          {levels.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Approval is required but no levels are configured, so nothing
              can ever be approved. Add a level below.
            </div>
          ) : (
            <ol className="space-y-3">
              {levels.map((l) => (
                <LevelRow
                  key={l.id}
                  slug={slug}
                  level={l}
                  members={members}
                  onResult={setResult}
                />
              ))}
            </ol>
          )}

          {emptyLevels.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Level {emptyLevels.map((l) => l.position).join(", ")} has no
              approvers — a request reaching it would stall.
            </div>
          )}

          {adding ? (
            <form
              ref={formRef}
              action={(fd) =>
                start(async () => {
                  const r = await addLevelAction(slug, module, fd);
                  setResult(r);
                  if (r.ok) {
                    formRef.current?.reset();
                    setAdding(false);
                  }
                })
              }
              className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <Field label="Name" hint="optional">
                <input
                  name="name"
                  placeholder="Manager"
                  className="w-36 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                />
              </Field>

              <Field label="Applies at or above">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">
                    $
                  </span>
                  <input
                    name="minAmount"
                    defaultValue="0"
                    inputMode="decimal"
                    className="tabular w-28 rounded-md border border-slate-300 py-1 pl-5 pr-2 text-right text-[12px]"
                  />
                </div>
              </Field>

              <Field label="Rule">
                <select
                  name="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px]"
                >
                  <option value="ANY_ONE">Any one</option>
                  <option value="QUORUM">Quorum</option>
                  <option value="ALL">All of them</option>
                </select>
              </Field>

              {mode === "QUORUM" && (
                <Field label="How many">
                  <input
                    name="quorumCount"
                    defaultValue="2"
                    inputMode="numeric"
                    className="tabular w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-[12px]"
                  />
                </Field>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add level
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="px-2 py-1.5 text-[12px] text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setResult(null);
              }}
              className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              + Add level
            </button>
          )}
        </div>
      )}

      {result?.ok && result.message && (
        <div className="mx-5 mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          {result.message}
        </div>
      )}
      {result && !result.ok && (
        <div className="mx-5 mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {result.error}
        </div>
      )}
    </section>
  );
}

function LevelRow({
  slug,
  level,
  members,
  onResult,
}: {
  slug: string;
  level: LevelView;
  members: MemberOption[];
  onResult: (r: FlowActionState) => void;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(level.approverIds);
  const [open, setOpen] = useState(false);

  const dirty =
    selected.length !== level.approverIds.length ||
    selected.some((id) => !level.approverIds.includes(id));

  return (
    <li className="rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700">
            {level.position}
          </span>
          <span className="text-[13px] font-medium text-slate-900">
            {level.name ?? `Level ${level.position}`}
          </span>
          <span className="text-[12px] text-slate-500">{level.rule}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[12px] text-indigo-600 hover:underline"
          >
            {level.approverIds.length === 0
              ? "Assign approvers"
              : `${level.approverIds.length} approver${level.approverIds.length === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => onResult(await removeLevelAction(slug, level.id)))
            }
            className="text-[12px] text-slate-400 hover:text-red-700 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
          {members.length === 0 ? (
            <div className="text-[12px] text-slate-500">
              No members to choose from — invite people first.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-1.5 text-[12px] text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, m.id]
                            : s.filter((x) => x !== m.id),
                        )
                      }
                      className="h-3 w-3"
                    />
                    {m.label}
                  </label>
                ))}
              </div>

              {dirty && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      onResult(
                        await setLevelApproversAction(slug, level.id, selected),
                      );
                      setOpen(false);
                    })
                  }
                  className="mt-2 rounded-md bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save approvers"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
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
