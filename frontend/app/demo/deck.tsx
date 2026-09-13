"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SLIDES } from "./slides";

/**
 * Deck shell.
 *
 * Arrow keys and click, because that's what hands do in front of a
 * projector without being told. The slide is keyed on its index so
 * React remounts it and the entrance animation replays — a cross-fade
 * between two slides that share a layout reads as a glitch.
 */
export function Deck() {
  const [i, setI] = useState(0);
  const [overview, setOverview] = useState(false);

  const go = useCallback((next: number) => {
    setI((cur) => Math.min(SLIDES.length - 1, Math.max(0, next ?? cur)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setOverview(false);
        setI((c) => Math.min(SLIDES.length - 1, c + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setOverview(false);
        setI((c) => Math.max(0, c - 1));
      } else if (e.key === "Escape") {
        setOverview((o) => !o);
      } else if (e.key === "Home") {
        setI(0);
      } else if (e.key === "End") {
        setI(SLIDES.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const s = SLIDES[i];
  const dark = !!s.dark;

  if (overview) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-baseline justify-between">
            <h1 className="text-[20px] font-semibold text-white">
              Procure — {SLIDES.length} slides
            </h1>
            <button
              onClick={() => setOverview(false)}
              className="text-[13px] text-slate-400 hover:text-white"
            >
              Esc to close
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SLIDES.map((sl, n) => (
              <button
                key={n}
                onClick={() => {
                  go(n);
                  setOverview(false);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  n === i
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/25"
                }`}
              >
                <div className="mono text-[11px] text-indigo-400">
                  {String(n + 1).padStart(2, "0")}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
                  {sl.eyebrow}
                </div>
                <div className="mt-1 line-clamp-3 text-[14px] font-medium leading-snug text-slate-200">
                  {typeof sl.headline === "string" ? sl.headline : sl.eyebrow}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-h-screen flex-col ${
        dark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* progress */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-black/5">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }}
        />
      </div>

      {/* the slide */}
      <main
        key={i}
        className="slide-in mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-8 py-20"
      >
        <div
          className={`text-[12px] font-semibold uppercase tracking-[0.14em] ${
            dark ? "text-indigo-400" : "text-indigo-600"
          }`}
        >
          {s.eyebrow}
        </div>

        <h1
          className={`mt-4 max-w-4xl text-[clamp(30px,5vw,56px)] font-semibold leading-[1.06] tracking-[-0.025em] ${
            dark ? "text-white" : "text-slate-900"
          }`}
        >
          {s.headline}
        </h1>

        {s.sub && (
          <p
            className={`mt-5 max-w-3xl text-[clamp(16px,2vw,21px)] leading-relaxed ${
              dark ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {s.sub}
          </p>
        )}

        {s.body}
      </main>

      {/* controls */}
      <footer
        className={`relative z-10 flex items-center justify-between gap-4 px-8 py-5 text-[12px] ${
          dark ? "text-slate-500" : "text-slate-400"
        }`}
      >
        <Link
          href="/"
          className={dark ? "hover:text-slate-300" : "hover:text-slate-700"}
        >
          ← Procure
        </Link>

        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              aria-label={`Slide ${n + 1}`}
              onClick={() => go(n)}
              className={`h-1.5 rounded-full transition-all ${
                n === i
                  ? "w-6 bg-indigo-500"
                  : dark
                    ? "w-1.5 bg-white/20 hover:bg-white/40"
                    : "w-1.5 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <span className="mono tabular">
            {String(i + 1).padStart(2, "0")} / {SLIDES.length}
          </span>
          <button
            onClick={() => setOverview(true)}
            className={dark ? "hover:text-slate-300" : "hover:text-slate-700"}
          >
            All slides
          </button>
        </div>
      </footer>

      {/* click zones — big, invisible, and behind the footer so the
          dots stay clickable */}
      <button
        aria-label="Previous slide"
        onClick={() => setI((c) => Math.max(0, c - 1))}
        className="absolute inset-y-0 left-0 w-[22%] cursor-w-resize focus:outline-none"
      />
      <button
        aria-label="Next slide"
        onClick={() => setI((c) => Math.min(SLIDES.length - 1, c + 1))}
        className="absolute inset-y-0 right-0 w-[22%] cursor-e-resize focus:outline-none"
      />

      <style>{`
        .slide-in { animation: slideIn .45s cubic-bezier(.16,1,.3,1) both; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .slide-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
