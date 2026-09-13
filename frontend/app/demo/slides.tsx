import type { ReactNode } from "react";

/**
 * The deck.
 *
 * Slides are data, not markup, so the shell handles navigation and each
 * one only describes what it says. Kept deliberately thin on words — a
 * slide someone reads is a slide they aren't listening to.
 */

export type Slide = {
  /// Small label above the headline
  eyebrow: string;
  /// The one thing this slide says
  headline: ReactNode;
  /// Optional supporting line, one sentence
  sub?: ReactNode;
  body?: ReactNode;
  /// Dark slides mark the turns in the argument
  dark?: boolean;
};

const ACCENT = "text-indigo-600";

export const SLIDES: Slide[] = [
  /* 1 ─ title */
  {
    eyebrow: "ETHGlobal · Procure",
    headline: (
      <>
        The approval <span className={ACCENT}>is</span> the payment.
      </>
    ),
    sub: "Crypto-native procure-to-pay. Settled in USDC on Arc.",
    body: (
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-slate-500">
        <Tag>Privy</Tag>
        <Tag>The Graph</Tag>
        <Tag>Arc</Tag>
      </div>
    ),
  },

  /* 2 ─ what procurement is */
  {
    eyebrow: "First, the process",
    headline: "Buying something at a company is five steps.",
    body: (
      <div className="mt-10 grid gap-3 sm:grid-cols-5">
        {[
          ["Request", "I need this"],
          ["Approve", "You may"],
          ["Order", "Supplier, please"],
          ["Receive", "It arrived"],
          ["Pay", "Here's the money"],
        ].map(([t, s], i) => (
          <div
            key={t}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="mono text-[11px] font-semibold text-indigo-600">
              0{i + 1}
            </div>
            <div className="mt-1 text-[15px] font-medium text-slate-900">
              {t}
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500">{s}</div>
          </div>
        ))}
      </div>
    ),
  },

  /* 3 ─ the problem */
  {
    eyebrow: "The problem",
    headline: (
      <>
        Every control sits in <span className={ACCENT}>software</span>{" "}
        beside the money.
      </>
    ),
    sub: "Not in the money.",
    body: (
      <ul className="mt-10 space-y-4 text-[17px] leading-relaxed text-slate-600">
        <Pain>
          A multisig approves <em>transfers</em>, not purchases. The signer
          has no idea if the goods arrived.
        </Pain>
        <Pain>
          An ERP knows all of it and enforces none of it cryptographically —
          change a row, change the answer.
        </Pain>
        <Pain>
          Invoice fraud is a $5B-a-year problem because &ldquo;approved&rdquo;
          is a database field.
        </Pain>
      </ul>
    ),
  },

  /* 4 ─ the turn */
  {
    dark: true,
    eyebrow: "What we're solving",
    headline: (
      <>
        An invoice that doesn&apos;t match the purchase order{" "}
        <span className="text-indigo-400">cannot be paid.</span>
      </>
    ),
    sub: "Not by policy. By construction.",
  },

  /* 5 ─ how: three-way match */
  {
    eyebrow: "How",
    headline: "Three documents. Three parties. No one can forge the set.",
    body: (
      <div className="mt-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Purchase order", "What we agreed to buy", "Purchaser"],
            ["Goods receipt", "What actually arrived", "Requester"],
            ["Vendor invoice", "What they're claiming", "The vendor"],
          ].map(([t, s, who]) => (
            <div
              key={t}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="text-[15px] font-medium text-slate-900">{t}</div>
              <div className="mt-1 text-[13px] text-slate-600">{s}</div>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-indigo-600">
                {who}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[15px] text-slate-600">
          They must agree within tolerance.{" "}
          <span className="font-medium text-slate-900">
            The vendor types their own figure
          </span>{" "}
          — nothing is prefilled, or the match would check its own homework.
        </p>
      </div>
    ),
  },

  /* 6 ─ where it's enforced */
  {
    dark: true,
    eyebrow: "Where it's enforced",
    headline: "On Arc. In a contract.",
    body: (
      <div className="mt-8">
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-6 text-[13px] leading-relaxed text-slate-300">
{`executePayment(order, signatures[])
  ├── recovers every approver signature
  ├── checks them against the onchain approver set
  ├── vendor on the risk allowlist?
  ├── within budget?  already paid?
  └── transfers USDC   ·   or REVERTS`}
        </pre>
        <p className="mt-6 text-[16px] text-slate-400">
          Compromise our server and you{" "}
          <span className="text-white">still</span> cannot pay an unapproved
          vendor an unapproved amount.
        </p>
      </div>
    ),
  },

  /* 7 ─ approvals */
  {
    eyebrow: "The trick that makes it work",
    headline: "Approvers sign. They never send a transaction.",
    body: (
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[13px] font-medium text-slate-900">
            At their desk
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            One EIP-712 signature from their own Privy wallet. Free,
            instant, no gas, empty wallet is fine.
          </p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
          <div className="text-[13px] font-medium text-indigo-900">
            At the counter
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-indigo-900/80">
            One transaction carries every signature. The chain counts them
            before the money moves.
          </p>
        </div>
        <p className="text-[15px] text-slate-500 sm:col-span-2">
          It&apos;s a cheque. You sign at your desk; the bank verifies when
          someone cashes it.
        </p>
      </div>
    ),
  },

  /* 8 ─ tracks */
  {
    eyebrow: "The stack",
    headline: "Three pieces, each doing real work.",
    body: (
      <div className="mt-10 space-y-4">
        <Track
          name="Privy"
          what="Org wallets, department wallets, policies, and the approver signatures the contract verifies."
          detail="Signs for Arc; we broadcast. Policy still fires at the signer."
        />
        <Track
          name="The Graph"
          what="Every vendor payout address screened across mainnet, Base and Arbitrum before it can receive a cent."
          detail="Blocked vendors leave the onchain allowlist."
        />
        <Track
          name="Arc"
          what="USDC as gas and as settlement. The registry holds the budget and the approver set."
          detail="A full cycle costs under a cent in gas."
        />
      </div>
    ),
  },

  /* 9 ─ features */
  {
    eyebrow: "What's built",
    headline: "A real product, not a demo path.",
    body: (
      <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Vendor risk, AI-explained", "Six onchain signals → score, band, and a 3D counterparty graph."],
          ["Three-way match", "Five checks, none short-circuiting. Failure blocks payment outright."],
          ["Auto-pay on match", "Matched bill settles itself. The last human step wasn't deciding anything."],
          ["Double-entry ledger", "GR/IR clearing nets to zero only when receipt and invoice agree."],
          ["Documents as PDFs", "Request, order, receipt, bill, remittance — with the Arc hash on it."],
          ["Configurable workflows", "Levels, quorum, thresholds — per org, per module, snapshotted."],
        ].map(([t, s]) => (
          <div
            key={t}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="text-[14px] font-medium text-slate-900">{t}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
              {s}
            </div>
          </div>
        ))}
      </div>
    ),
  },

  /* 10 ─ risk detail */
  {
    eyebrow: "Vendor risk",
    headline: (
      <>
        Screening that <span className={ACCENT}>spam can&apos;t fool.</span>
      </>
    ),
    body: (
      <div className="mt-10 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[13px] font-medium text-slate-900">
            An unused vanity address scored 100/100.
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">
            Airdrop spam looked like counterparty diversity. We screened on
            stablecoins only — it scored 100 again, because address
            poisoning sends <em>genuine</em> sub-dollar USDC.
          </p>
          <p className="mt-2 text-[14px] font-medium text-slate-900">
            A $10 dust floor fixed it.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
          <Score label="Circle treasury" value="88" tone="text-emerald-600" />
          <Score label="Vitalik" value="100" tone="text-emerald-600" />
          <Score label="Poisoned vanity" value="60" tone="text-amber-600" />
          <Score label="Never used" value="47" tone="text-red-600" />
        </div>
      </div>
    ),
  },

  /* 11 ─ honesty */
  {
    dark: true,
    eyebrow: "What we don't claim",
    headline: "The chain can't know the goods arrived.",
    sub: "That's an assertion the approvers sign about.",
    body: (
      <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-slate-400">
        What it enforces is that the approvers this org registered, in
        sufficient number, signed for{" "}
        <span className="text-white">
          exactly this payee, this amount, this order
        </span>{" "}
        — once, within budget, to a screened vendor.
      </p>
    ),
  },

  /* 12 ─ proof */
  {
    eyebrow: "Live",
    headline: "Deployed, tested, and moving real USDC.",
    body: (
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Proof k="ProcureRegistry" v="0xa033ac54…FE11f0" note="Arc testnet" />
        <Proof k="Contract tests" v="14 passing" note="mostly revert paths" />
        <Proof k="Gas per cycle" v="< $0.01" note="USDC is the gas token" />
        <Proof k="Approver cost" v="$0.00" note="signing is free" />
      </div>
    ),
  },

  /* 13 ─ close */
  {
    dark: true,
    eyebrow: "Procure",
    headline: (
      <>
        Spend controls that survive{" "}
        <span className="text-indigo-400">losing the server.</span>
      </>
    ),
    sub: "The approval is the payment.",
  },
];

/* ── small pieces ────────────────────────────────────────────────── */

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
      {children}
    </span>
  );
}

function Pain({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-[11px] h-px w-6 shrink-0 bg-red-400" />
      <span>{children}</span>
    </li>
  );
}

function Track({
  name,
  what,
  detail,
}: {
  name: string;
  what: string;
  detail: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-slate-200 pb-4">
      <div className="w-28 shrink-0 text-[17px] font-semibold tracking-tight text-indigo-600">
        {name}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-relaxed text-slate-800">{what}</div>
        <div className="mt-0.5 text-[13px] text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

function Score({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={`tabular text-[22px] font-semibold ${tone}`}>
        {value}
      </span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function Proof({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">
        {k}
      </div>
      <div className="mono mt-1 text-[17px] font-semibold text-slate-900">
        {v}
      </div>
      <div className="mt-0.5 text-[12px] text-slate-500">{note}</div>
    </div>
  );
}
