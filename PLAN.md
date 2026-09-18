# Procure

**Crypto-native procurement. The approval is the payment.**

Vendor risk screening → purchase request → approval quorum → purchase order → three-way match → automatic USDC settlement on Arc.

Two independent controls: an onchain risk score that gates which vendors can be paid at all, and a policy engine that refuses to sign anything outside that allowlist.

**Event:** ETHOnline 2026 · **Submission deadline:** Sun 13 Sep 2026, 12:00 EDT · **Arc mainnet deploy window:** by 30 Sep 2026

---

## Table of contents

1. [Problem & thesis](#1-problem--thesis)
2. [Tracks & why each technology is here](#2-tracks--why-each-technology-is-here)
3. [Architecture](#3-architecture)
4. [Data model](#4-data-model)
5. [Full flow](#5-full-flow)
6. [Workflow engine](#6-workflow-engine)
7. [Accounting](#7-accounting)
8. [Notifications](#8-notifications)
9. [PDF documents](#9-pdf-documents)
10. [Vendor portal](#10-vendor-portal)
11. [Vendor risk assessment](#11-vendor-risk-assessment)
12. [Tech stack & verified environment](#12-tech-stack--verified-environment)
13. [UI direction](#13-ui-direction)
14. [Scope](#14-scope)
15. [Build sequence](#15-build-sequence)
16. [Open questions](#16-open-questions)
17. [Submission checklist](#17-submission-checklist)

---

## 1. Problem & thesis

### The problem

Onchain companies hold serious treasuries and manage spend like a group chat. The state of the art is a Gnosis Safe — which is a **signing tool, not a spend management system.** A Safe executes whatever N people approve. It has no concept of a budget, a purchase order, a vendor, or whether the thing being paid for actually arrived.

| Missing control | Consequence |
|---|---|
| Spend policies | A $200 payment and a $200k payment go through the identical manual ceremony |
| Approval hierarchies | No routing by amount, category, or department |
| Enforced budgets | Departments overspend, discovered at quarter-end |
| Purchase orders | No record of what was committed before cash moved |
| Receipt matching | You pay invoices for things that never arrived |
| Duplicate detection | The same invoice gets paid twice |
| Vendor allowlists | "Our bank details changed" → funds gone |
| Accounting export | Bookkeeper reconciles by hand from block explorers |

In Web2 this category is mature and large — Ramp, Brex, Coupa, Ariba, Airbase, Tipalti, Zoho Procurement. It exists because spend control is a real operational problem. Onchain companies have none of it.

### The thesis

> In Web2, the three-way match is a **procedural** control. Software checks PO against receipt against invoice, a human clicks "pay," and the bank does as it's told. The control and the money are separate systems.
>
> Onchain, the match becomes a **precondition for funds to move at all.** The policy doesn't recommend the payment. The policy *is* the authorization.

This structurally defeats business email compromise — the *"our account details have changed, please remit here"* attack that the FBI's IC3 consistently ranks among the largest categories of reported business loss. If the vendor address is allowlisted at the wallet level and funds can only route to the PO-matched vendor, the attack does not execute.

**Headline:** *An invoice that doesn't match the PO cannot be paid. Not by policy — by construction.*

### The two gates

1. **Risk gate** — an address only enters the allowlist after onchain risk screening
2. **Policy gate** — Privy's policy engine refuses to sign anything outside the allowlist

The first answers *"who is allowed to be paid?"* The second answers *"can this wallet even make this payment?"* Both must pass. That is segregation of duties, which is how real treasury controls are built.

---

## 2. Tracks & why each technology is here

| Track | What it demands | Why we're on it |
|---|---|---|
| **Privy — Best B2B Financial Product** | Org wallets, policies, team permissions, quorum approvals, intents, automated transactions, event-driven ops | **Primary.** Procurement needs exactly these primitives — this is the natural fit, not a stretch |
| **Privy — Best Financial Flow** | A real financial flow with onchain complexity hidden from the user | Vendor gets paid in USDC without ever seeing a wallet, gas estimate, or signature prompt |
| **Arc — DeFi/Onchain Finance** | "Conditional payments, onchain automation, multi-step settlement" | That's the thesis verbatim — payment conditional on three-way match |
| **Arc — Testnet → Mainnet** | Deployed or deployment-ready on mainnet by 30 Sep | We're building on Arc anyway; mainnet deploy is a post-submission step |
| **The Graph — AI Use Case (From Scratch)** | Graph load-bearing, live data, real reasoning/automation | Risk score gates the allowlist, which gates payment — a decision in the payment path |

### Technology choices

| Choice | Why |
|---|---|
| **Privy** over Circle Wallets | Server wallets + policy engine + quorum give us the whole control surface in one place. Arc lists Circle Wallets as a core product, so expect some tension on their tracks — accepted tradeoff. |
| **Arc** as settlement chain | USDC-native, sub-cent predictable fees, sub-500ms finality. A $12k vendor payment settling in under a second with a fee measured in fractions of a cent is the point. |
| **The Graph** for vendor screening | Indexed cross-chain transfer history is the only practical way to assess an address we've never paid before |
| **ERC-20 `transfer()`** over native | Keeps the entire payment path *and* the policy config in 6 decimals. See §16. |
| **SQLite/Prisma** | Zero infra, and the schema doubles as the data-model documentation |

### Per-track requirements

#### Privy — Best B2B Financial Product ✅ all cleared

| Requirement | Procure |
|---|---|
| Privy integrated as core component | Wallets, policies, quorum all central |
| Create or use ≥1 Privy wallet | Three kinds — treasury, department, user |
| Demonstrate business/org use case | Procurement |
| ≥1 functional B2B workflow | **All four** — payment, approval, treasury op, wallet admin |
| ≥1 Privy control (policies/signers/quorums/intents) | **All four** |
| Working demo + source access | — |
| Clearly explain Privy's role | README section, architecture diagram, video |

Track description explicitly names *"spend management tools"* and *"shared organization wallets"* as example projects.

#### Privy — Best Financial Flow

Judging line: *"simplify a real financial flow and hide unnecessary onchain complexity from the user."* The vendor receives USDC without ever seeing a wallet UI, a gas estimate, or a signature prompt. "Payouts" is explicitly listed as an eligible flow.

#### Arc — Best DeFi/Onchain Finance Application

Requirement quote: *"Advanced programmable money flows such as **conditional payments**, onchain automation or **multi-step settlement**."* Payment conditional on three-way match; settlement across PR→PO→receipt→bill→pay.

> ⚠️ **Tension:** Arc lists Circle Wallets, App Kits, and Circle Contracts as core products. We use Privy wallets. Requirement only says "meaningful use of Arc and USDC," so we qualify — but Arc judges may favour teams on Circle's own stack. Privy is still the right call: it carries two tracks and gives us the whole control surface (server wallets + policy engine + quorum) in one place.

#### Arc — Launch on Testnet & Push to Mainnet

> *"Projects must be deployed or **deployment-ready** on Arc mainnet by **September 30**"*

Build on testnet, submit 13 Sep, deploy to mainnet after it launches 16 Sep. Requires **architecture diagram** and **detailed documentation**.

#### The Graph — AI Use Case (From Scratch)

| Requirement | How we meet it |
|---|---|
| Graph as load-bearing part | Risk score **gates the allowlist**, which gates payment — a decision in the core payment path, not a dashboard widget |
| Consume live data from a Graph provider | Token API via The Graph Market (no mocked data) |
| Meaningful work: reasoning, decisions, automation | Automated allowlist gating + AI-written risk narrative |
| Open source with clear README/SKILL.md | — |
| 2–4 minute demo video | Tightest video cap across all tracks — cut to this |

**Positioning:** the model is **behavioural** — it reads how an address *transacts* (flow shape, counterparty spread, forwarding patterns) rather than how long it has existed. Describe it that way in the README and the video. It's accurate, it's the model's genuine strength, and it needs no caveat.

> Internal note: the Token API's transfer window (30d default, 180d max) is what shapes this. Don't volunteer it — but never claim longevity or address-age analysis either, since we don't do it. If a Graph judge asks directly, answer straight: they built the API and know its limits, and a bluff collapses badly in person.

---

## 3. Architecture

### Wallet topology

```
┌──────────────────────────────────────────────────────┐
│  TREASURY WALLET            (Privy organization)     │
│  Holds company USDC. Controller-managed.             │
└───────┬─────────────────┬─────────────────┬──────────┘
        │ fund budget     │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ENGINEERING  │  │  MARKETING   │  │     OPS      │
│ Privy server │  │ Privy server │  │ Privy server │
│ $50k/quarter │  │ $20k/quarter │  │ $15k/quarter │
│              │  │              │  │              │
│ Policy:      │  │              │  │              │
│ • USDC only  │  │              │  │              │
│ • allowlist  │  │              │  │              │
│ • max $25k/tx│  │              │  │              │
└──────┬───────┘  └──────────────┘  └──────────────┘
       │ payment on match pass
       ▼
┌──────────────────────┐
│  VENDOR ADDRESS      │  External. Not ours.
│  (allowlisted only)  │  Risk-screened before entry.
└──────────────────────┘

USER WALLETS (Privy embedded, one per member)
  → approvers SIGN approvals. Approval is a signature, not a DB row.
```

| Wallet | Type | Purpose |
|---|---|---|
| Treasury | Privy organization wallet | Company float, controller-managed |
| Department | Privy server wallet | Funded to budget. **Pays vendors.** |
| User | Privy embedded wallet | Approvers sign here. Quorum enforced cryptographically. |
| Vendor | External address | Allowlisted recipient only |

**Why department wallets are pre-funded:** if Engineering's wallet holds exactly $50k, it *physically cannot* overspend its budget — the money isn't there. Stronger than any software check.

> Production would use central funds + allowances (more capital-efficient). Pre-funding is the correct hackathon choice and the stronger demo. Know the tradeoff if asked.

**Why approvals are signatures:** an approval that's a database row can be forged by anyone with DB access. An approval that's a signature from the approver's own wallet cannot. Privy's quorum enforces 2-of-3 at the wallet layer, not in our code.

### Control layers

```
┌─────────────────────────────────────────────┐
│  App (Next.js)                              │
│  UI, orchestration, non-critical state      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Contracts on Arc                           │
│  "Is this payment AUTHORIZED?"              │
│  PO registry · match verification ·         │
│  budget encumbrance · release authorization │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Privy policy engine                        │
│  "CAN this wallet even make this payment?"  │
│  USDC only · allowlisted recipients ·       │
│  max amount · time windows                  │
└─────────────────────────────────────────────┘
```

**Demonstrate this:** even with full backend compromise, the wallet still won't sign a payment to a non-allowlisted address. Attempt a direct transfer bypassing the app and show Privy refusing. Almost no submission demos its own control surviving its own compromise.

---

## 4. Data model

### Masters (org level)

**Item**
`code · name · description · unit · default rate · default expense account · tax · category · active`

PR lines reference Items. This is what makes GL coding automatic instead of someone picking an account from a dropdown and getting it wrong.

**Vendor**
`name · email · payout address · payment terms (Net 30) · default AP account · category · risk score · risk assessed at · status (draft/active/blocked)`

**Account** (chart of accounts)
`code · name · type (Asset/Liability/Equity/Income/Expense) · subtype · parent · active`

**Organization** · **Department** · **User** · **Membership**
Membership is per `(user, department)` — a user can be a Requester in Engineering and an Approver in Marketing.

**Policy**
`department · approval thresholds · per-tx cap · permitted categories · match tolerance (bps)`

### Documents

| Object | Holds |
|---|---|
| **PurchaseRequest** | requester, department, vendor, lines, amount, justification, status |
| **Approval** | PR, approver, signature, timestamp |
| **PurchaseOrder** | PR ref, PO number, vendor, amount, terms, status, vendor response |
| **GoodsReceipt** | PO ref, received by, date, lines |
| **VendorInvoice** | PO ref, vendor invoice number, amount, submitted at |
| **Bill** | PO ref, invoice ref, **PO amount**, **invoice amount**, status |
| **MatchResult** | Bill ref, outcome, variance, reason |
| **Payment** | Bill ref, from wallet, to address, amount, tx hash, status |
| **JournalEntry** | date, lines (account, dr, cr), source doc ref |
| **Notification** | event id, recipient, template, subject, body, sent at, provider id |

**The Bill carries both PO amount and invoice amount.** If the Bill were generated purely from the PO it would match itself by construction and the three-way match would be theatre. The variance between them is what the match tests.

---

## 5. Full flow

### Document chain

```
PURCHASE REQUEST          internal ask, approval-routed
      │ quorum met
      ▼
PURCHASE ORDER            issued, PDF emailed to vendor
      │
      ▼
  ┌─── VENDOR PORTAL ────────────────────┐
  │  Accept / Reject / Comment            │
  └───────────────┬───────────────────────┘
      accepted    │    rejected → back to requester
      ▼
GOODS RECEIPT             requester confirms delivery
      │
      ▼
VENDOR INVOICE            vendor submits in portal, against the PO
      │
      ▼
"CONVERT TO BILL"         org action — Bill carries PO amount
      │                   AND vendor's invoiced amount
      ▼
THREE-WAY MATCH           PO ↔ Receipt ↔ Bill
      │
   ┌──┴──┐
 PASS   FAIL → vendor emailed variance, corrects, re-match
   │
   ▼
PAYMENT (USDC on Arc) → REMITTANCE ADVICE
```

### Phase A — Setup (controller)

| # | Action | System does | Emails |
|---|---|---|---|
| 1 | Create org | Provisions Privy treasury wallet | — |
| 2 | Add users by email | Invite; on accept, Privy embedded wallet created | → new user |
| 3 | Assign department + role | Role is per user-per-department | → user |
| 4 | Create departments | Privy server wallet each | — |
| 5 | Allocate budgets | Treasury → department wallet transfer | → dept approvers |
| 6 | Set approval matrix | `<$1k` auto · `$1k–10k` one · `>$10k` 2-of-3 | — |
| 7 | Create items | With default expense accounts | — |
| 8 | **Onboard vendor** | Address → **Graph risk dossier + AI narrative** → controller approves → **address enters Privy allowlist** | → vendor (onboarding + confirm address) |

> Step 8 is the front gate. An address that hasn't passed risk review never enters the allowlist, and an address not on the allowlist cannot be paid — enforced by Privy, not by our app.

### Phase B — Procure to pay

| # | Actor | Action | System | Emails |
|---|---|---|---|---|
| 9 | Requester | Raise PR: $12,000, Northwind, Infrastructure | **Pre-checks:** vendor allowlisted? budget available? category permitted? | → approvers · requester |
| — | | *pre-check fails* | Rejected with reason | → requester (which check) |
| 10 | | Routing | >$10k → quorum 2-of-3 | — |
| 11 | Approver A | Signs | 1 of 2. **Nothing moves.** | → remaining approver |
| 12 | Approver B | Signs | Quorum met | — |
| 13 | | **PO issued** | Onchain. **Budget encumbered:** $50k → $38k available | → **vendor (PO PDF)** · requester |
| 14 | Vendor | Accepts PO in portal | PO status → accepted | → requester · controller |
| 15 | Requester | Confirm goods receipt | GRN recorded | → vendor (GRN PDF) |
| 16 | Vendor | Submits invoice — **$13,500** | Invoice recorded against PO | → controller · requester |
| 17 | Controller | **Convert to Bill** | Bill created carrying PO $12,000 + invoice $13,500 | → controller (Bill PDF) |
| 18 | | **Three-way match** | variance $1,500 > $120 tolerance → **FAIL** | → **vendor** (variance detail) · controller |
| 19 | Vendor | Corrects to $12,000 | Bill amended, match re-runs | — |
| 20 | | **Match passes** | PO ✓ receipt ✓ bill ✓ vendor ✓ no prior payment ✓ | — |
| 21 | | **Payment executes** | Privy server wallet → vendor, USDC on Arc | — |
| 22 | | Settlement | Encumbrance released, spend recorded | → **vendor: remittance PDF + tx hash** · requester · controller |
| 23 | | Ledger | Journal entries posted, GL export available | — |

### How payment actually executes

```
MATCH_PASSED event
   │
   ▼
Payment executor builds the transfer
   from:  Engineering department wallet
   to:    vendor address
   asset: USDC   amount: 12,000.000000
   caip2: eip155:5042002
   │
   ▼
Privy server wallet API
   │
   ▼
PRIVY POLICY ENGINE  ← independent second control
   ✓ recipient on allowlist?
   ✓ asset is USDC?
   ✓ amount ≤ per-tx cap?
   ✗ any fail → refuses to sign
   │
   ▼
Signed → broadcast to Arc → sub-500ms finality
   │
   ▼
PAYMENT_SETTLED event
   ├─→ release encumbrance, record spend
   ├─→ journal entries
   └─→ remittance advice email (with tx hash)
```

---

## 6. Workflow engine

### State machines

```
PURCHASE REQUEST
  DRAFT → SUBMITTED → ┬→ PRECHECK_FAILED
                      └→ PENDING_APPROVAL → ┬→ REJECTED
                                            └→ APPROVED ──┐
PURCHASE ORDER                                            │
  ISSUED ←────────────────────────────────────────────────┘
     → VENDOR_ACCEPTED → RECEIVED → CLOSED
     → VENDOR_REJECTED
     → CANCELLED

BILL
  RECEIVED → MATCHING → ┬→ MATCH_FAILED ──(vendor corrects)──┐
                        │         ▲                          │
                        │         └──────────────────────────┘
                        └→ MATCHED → SCHEDULED → PAID
                                                → DISPUTED

PAYMENT
  PENDING → SUBMITTED → ┬→ CONFIRMED
                        └→ FAILED → (retry / alert)
```

**Every transition:** guard → transition → emit event. Guards are the policy checks.

### Event consumers

| Subscriber | Does |
|---|---|
| **Notifier** | Sends email. Never inline — a failed SMTP must not roll back a payment. |
| **Ledger** | Writes journal entries |
| **Monitor** | Budget thresholds, stale approvals, vendor risk drift |

### Automated workflows

| Workflow | Trigger | Action | Privy primitive |
|---|---|---|---|
| **Approval routing** | PR submitted | Evaluate amount → route to approver set | Team permissions |
| **Quorum collection** | Approver signs | Count signatures, fire on threshold | **Quorum approvals** |
| **Auto-approve small** | PR < $1,000 in budget | Skip approval entirely | Policies |
| **Match on receipt** | Bill created / receipt confirmed | Run three-way match | Event-driven |
| **Auto-release** | Match passes | Execute payment, no human | **Automated transactions** |
| **Encumbrance** | PO issued / payment settled | Reserve then release budget | — |
| **Remittance** | Payment confirmed | Email vendor with tx hash | Event-driven |
| **Budget alerts** | 80% / 100% consumed | Notify dept + controller | Monitor |
| **Risk drift** *(stretch)* | Vendor behaviour changes | Freeze payments, alert | Monitor |
| **Stale approval** *(stretch)* | Pending > 48h | Remind, then escalate | Monitor |

A purchase request is a Privy **intent** — a standing instruction that executes when conditions clear. Not a person clicking send.

---

## 7. Accounting

### Chart of accounts (seed)

| Code | Account | Type |
|---|---|---|
| 1000 | Cash — USDC Treasury | Asset |
| 1010 | Cash — USDC Engineering | Asset |
| 1020 | Cash — USDC Marketing | Asset |
| 1030 | Cash — USDC Ops | Asset |
| **2000** | **Accounts Payable** | Liability |
| **2100** | **GR/IR Clearing** | Liability |
| 5000 | Infrastructure Expense | Expense |
| 5100 | Software Expense | Expense |
| 5200 | Professional Services | Expense |
| 6000 | Marketing Expense | Expense |

### Double-entry treatment

| Event | Dr | Cr |
|---|---|---|
| **PO issued** | *no GL entry* — encumbrance is a **budgetary** control, not a posting | |
| **Goods received** | Expense (from Item's default account) | **GR/IR Clearing** |
| **Bill recorded** | **GR/IR Clearing** | Accounts Payable |
| **Payment settled** | Accounts Payable | Cash — USDC (department wallet) |

> **GR/IR Clearing is the accounting embodiment of the three-way match.** It holds the timing difference between "the goods arrived" and "the invoice arrived." A non-zero GR/IR balance means exactly one thing: something was received but not billed, or billed but not received. **That account is the match exception report.**

### Budget arithmetic

```
Available = Allocation − Spent − Encumbered
```

Without the encumbered term there's a real bug: five separate $12k POs against a $50k budget each pass the check individually (nothing has been *paid* yet), all approve, and you end $10k over with five valid POs and no money. **Approval commits budget, not payment.**

### Trial balance

Build a page that proves it balances. Nothing convinces a finance-literate judge faster than a balanced TB derived from onchain payments.

### GL export

Journal entry per payment: GL code, cost center, vendor ref, PO ref, **tx hash**.

> **The tx hash is the reconciliation key.** In Web2, matching bank lines to GL entries is manual misery. Here the payment carries its PO reference and the journal entry carries the hash — reconciliation becomes a join. This is the sleeper feature.

---

## 8. Notifications

### Setup events

| Event | → Recipient | Content |
|---|---|---|
| User invited | New user | Invite link, account + wallet setup |
| Department / role assigned | User | "You're a Requester in Engineering" |
| **Vendor onboarded** | **Vendor** | How to submit invoices, **confirm payout address** |
| Budget allocated / changed | Dept approvers + controller | New allocation, period |

### Procure-to-pay events

| Event | → Recipient | Content |
|---|---|---|
| PR submitted | **Approvers** (action required) · Requester | Amount, vendor, justification, budget impact |
| PR fails pre-check | **Requester** | Which check failed |
| Partial approval (1 of 2) | Remaining approvers · Requester | "1 of 2 — awaiting Priya" |
| Approver rejects | **Requester** | Reason |
| **PO issued** | **Vendor** (PO PDF + portal link) · Requester · Approvers | PO number, amount, terms |
| **Vendor accepts PO** | Requester · Controller | Ready to receive |
| **Vendor rejects PO** | **Requester** · Controller | Rejection reason |
| **Vendor comments** | Requester | Comment thread |
| Goods receipt confirmed | Requester · Vendor (GRN PDF) | Delivery acknowledged |
| **Vendor submits invoice** | Controller · Requester | Invoice ref, amount vs PO |
| Bill created | Controller | Bill PDF |
| **Match FAILED** | **Vendor** · Controller · Requester | Variance detail, correct in portal |
| Match passed → payment released | Vendor · Requester · Controller | Payment initiated |
| **Payment settled** | **Vendor — remittance advice** | Invoices covered, amount, **tx hash** |
| Duplicate invoice detected | **Controller** (alert) · Vendor | Prior payment ref |
| Budget 80% / 100% consumed | Dept approvers · Controller | Remaining, encumbered |

### Architecture

```
WORKFLOW EVENT
    │
    ▼
  Notifier
    ├──→ Outbox (DB)      ← always writes, this is what we demo
    └──→ Mailer interface ← swappable: Resend | ZeptoMail | SMTP | Noop
```

**Why:**
1. **Demo resilience.** If the provider rate-limits or wifi dies mid-recording, the outbox panel still shows the full event chain.
2. **Build before credentials.** Start with the Noop mailer; wire real sending later. Not a day-one blocker.

**Idempotency:** notification log keyed on `(event_id, recipient, template)`. Match re-runs and page refreshes must not re-send.

**Demo addressing:** Resend restricts unverified accounts to the signup address. Use plus-addressing for personas — `you+vendor@`, `you+approver@`, `you+requester@`. They render as distinct recipients in the outbox.

> ⚠️ Use fake vendor domains. Never send POs or invoices to real companies.

---

## 9. PDF documents

Generated with `@react-pdf/renderer` — server-side, templated, no headless browser.

| Document | Goes to |
|---|---|
| Purchase Request | Internal — approval record |
| **Purchase Order** | **Vendor** — the transmitted document |
| Goods Receipt Note (GRN) | Internal + vendor |
| **Bill** | Internal AP record |
| **Payment Voucher / Remittance Advice** | **Vendor** — carries the tx hash |

Shared layout component: org header, document number, dates, party blocks, line table, totals, terms, footer. One template, five instantiations. Each PDF attaches to its email and stores against the record.

---

## 10. Vendor portal

| | |
|---|---|
| **Auth** | Privy email OTP → embedded wallet provisioned |
| **Scope** | Sees only POs addressed to them. Multi-org safe — one vendor, many buyers. |
| **Can do** | View PO · **Accept / Reject / Comment** · Submit invoice against accepted PO · View payment + remittance · Manage payout address |
| **Cannot see** | Budgets, other vendors, internal approvals, chart of accounts |

Comment thread is per-PO, visible both sides — that's where "can you extend delivery to the 20th?" lives, and it's what makes it a portal rather than a form.

**Visual distinction is a demo requirement.** We switch between org view and vendor view repeatedly on camera. Give the portal a distinct accent and a persistent context banner — *"Northwind Cloud · Vendor Portal"* — so the switch is unmistakable in a single frame.

---

## 11. Vendor risk assessment

### Why it matters

Every other control protects payments to whoever is on the allowlist. So the real question is: **how does an address get on the allowlist in the first place?** That's where BEC lands. The risk screen closes that hole.

### The gate

```
Vendor onboarding
   → Graph Token API pulls transfer history
   → signals computed
   → AI writes assessment narrative
   → score below threshold?
        → BLOCKED — address never enters Privy allowlist
        → and therefore CANNOT be paid
```

Graph data makes a decision in the core payment path. That is the "load-bearing" claim, and it is literally true.

### Signals

The model is **behavioural**: it reads how an address transacts, not how long it has existed.

| Signal | Tells you | Weight |
|---|---|---|
| **Immediate forwarding / sweep pattern** | Pass-through or mule account | **Strong** |
| Counterparty diversity | Operating business vs conduit | Moderate |
| Stablecoin flow shape | Commercial rhythm vs lumpy movement | Moderate |
| Volume + cadence | Real activity level | Moderate |
| Balances across chains | Substance | Contextual |
| EOA vs contract (Safe/multisig) | Professional treasury? | Contextual — via `getCode` |

Sweep detection is the highest-value signal and the one most likely to stop a genuinely bad onboarding: an address that forwards ~everything it receives within a block or two is a conduit, not a supplier.

**Chains covered by Token API:** Ethereum, Arbitrum, BSC, Polygon, Optimism, Base. **Not Arc.**

> We analyse Ethereum/L2 history, then pay on Arc. Frame it positively: *"before approving this address for payment on Arc, here's what it has done everywhere else."*

### AI's role

**The Graph produces signals. AI writes the assessment.** Not the other way round.

- Deterministic, verifiable indexed data → structured signals
- AI produces a plain-English narrative a procurement person can act on
- AI flags anomalies the rules didn't anticipate

If AI does the *detection*, it's hand-waving. If AI does *interpretation* over verifiable indexed data, it's exactly the track's ask.

### How to describe it

- It's a **behavioural** model — it reads how an address transacts
- The score is **advisory to a human reviewer**, never auto-approve. Say this; it's a strength, not a hedge — no serious AP system auto-onboards a supplier.
- It answers *"does this address behave like a legitimate operating business?"* — not *"is this address who they claim to be?"* Scoping the claim precisely makes it credible rather than overreaching.

---

## 12. Tech stack & verified environment

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 |
| Chain | **Arc testnet only** |
| Chain client | viem |
| Wallets | Privy — `@privy-io/server-auth`, `@privy-io/react-auth` |
| DB | Prisma + SQLite |
| Email | Resend (behind a Mailer interface) |
| PDF | `@react-pdf/renderer` |
| Indexer | The Graph Token API |
| AI | Anthropic or OpenAI, server-side only |

### Arc testnet — verified live 2026-09-06

| | |
|---|---|
| Chain ID | **5042002** (`0x4cef52`) — confirmed via `eth_chainId` |
| CAIP-2 | `eip155:5042002` — this is what Privy's server wallet API expects |
| RPC | `https://rpc.testnet.arc.io` · `wss://rpc.testnet.arc.io` |
| Explorer | `https://testnet.arcscan.app` |
| Consensus | Malachite (Tendermint-derived BFT), sub-500ms finality |
| Execution | Reth, EVM-compatible, EIP-1559 supported |
| Gas token | **USDC** |

### ⚠️ The decimals trap

Arc runs a hybrid decimal model:

- **Native gas accounting: 18 decimals.** `eth_getBalance`, `eth_gasPrice`, all fee fields.
- **USDC ERC-20 interface: 6 decimals.** Transfers and anything a human reads.

Same underlying balance, **not interchangeable numbers.** Confirmed empirically: `eth_gasPrice` returned `0x4e3b29200` (21e9), i.e. 18-decimal representation.

Mixing them is a silent 10¹² error — which in a spend-management product means the three-way match compares $12,000 against $0.000000012 and passes.

**Discipline:** every business amount is an integer count of USDC base units (6 dp). Never a float. Branded TypeScript types (`Usdc6` / `Native18`) make mixing them a **compile error**. All formatting lives in one module; never format a raw balance inline.

> Two files from earlier prototyping implement this and should be brought over: `lib/chain.ts` (Arc chain definition) and `lib/units.ts` (branded types + formatting).

### Repo layout

Monorepo under `~/personal/procure/`:

```
procure/
├── PLAN.md
├── frontend/          Next.js app
└── contracts/         (if onchain PO registry / match verification lands)
```

### Git identity

Local config set to `technicalclipper <technicalclipper@gmail.com>` so commits don't go out under the work address.

> Root cause of the global problem: `~/.gitconfig` has `includeIf "gitdir:~/personal/"` **before** the `[user]` block, and git config is last-wins — so the company identity overrides it. Moving the `includeIf` to the end of the file fixes all `~/personal` repos.
>
> The initial commit `4b38f34` was authored with the work address and is already pushed. Fix with `--amend --reset-author` + `--force-with-lease` if desired.

---

## 13. UI direction

**Modern fintech SaaS — Ramp/Brex/Linear, not Bloomberg terminal.**

The thesis is *"this is a real financial product, not a crypto toy."* The UI must say that in the first second of the video. Judges evaluating "Best B2B Financial Product" will subconsciously compare against Ramp and Coupa.

| | Choice |
|---|---|
| Mode | Light only. No dark toggle. |
| Palette | Neutral slate/zinc + **one** accent. Restraint signals seriousness. |
| Status colors | Semantic and consistent — amber pending · green approved/matched/paid · red rejected/failed · slate draft |
| Type | Inter or system stack. **Tabular numerals on every money column.** |
| Money | Right-aligned, 2dp, `$` prefix. Misaligned money columns read as amateur. |
| Layout | Sidebar nav + main. Standard — a judge shouldn't learn our navigation in 3 minutes. |
| Detail pages | Document-shaped, mirroring the PDFs |

### The five screens that carry the demo

1. **Match result panel** — the money shot. PO ↔ Receipt ↔ Bill side by side, variance highlighted, PASS/FAIL unmissable. Disproportionate polish here.
2. **Approval progress** — "1 of 2" with avatars and who's outstanding.
3. **Budget meter** — stacked bar: allocated / **encumbered** / spent. Communicates encumbrance instantly.
4. **Outbox** — email feed. Makes the invisible event bus visible.
5. **Trial balance** — and it balances.

**Avoid:** animations that eat video seconds · charts · custom font loading · anything needing explanation before it's understood.

---

## 14. Scope

### CORE — the submission is this

Org / department / user management · role per department · Privy wallets (treasury, department, user) · item master · vendor master · chart of accounts · vendor allowlist · approval matrix · PR → quorum → PO · encumbrance · vendor portal accept/reject/comment · goods receipt · vendor invoice → Bill · **three-way match with tolerance** · **auto-release USDC on Arc** · double-entry ledger · email on every workflow event · outbox panel · **vendor risk dashboard (Graph signals + AI narrative + allowlist gating)**

> **The risk dashboard is core, not stretch.** It is the front gate of the whole product — every other control protects payments to whoever is already on the allowlist, so the question of *how an address gets there* is the one that matters most. It is also the entire basis of the Graph submission. Scheduled mid-week, never last.

### STRETCH — in this order

1. PDF generation (5 templates)
2. Trial balance + GL export
3. Duplicate bill detection
4. Budget threshold alerts
5. Risk drift monitoring (ongoing re-screening of onboarded vendors)

### CUT — without debate

Expense reimbursement (a second product) · multi-currency · OCR · partial receipts/invoicing · PO amendments · approval delegation · charts · dark mode

---

## 15. Build sequence

Today is **Sat 6 Sep**. Submission **Sun 13 Sep, 12:00 EDT**. That is ~7 working days.

Ordered so the two things that *are* the submission — the three-way match and the risk gate — are both working by Wednesday night, with the softer features after.

| Day | Focus |
|---|---|
| **Sat 6** | **Smoke test first** — Privy server wallet signs and sends USDC via ERC-20 `transfer()` on Arc testnet; confirm policy allowlisting works and decimals round-trip. Then: Prisma schema, seed data. |
| **Sun 7** | Masters (item, vendor, CoA, departments, users, memberships). Privy wallet provisioning. Vendor onboarding shell. |
| **Mon 8** | PR → approval routing → quorum → PO. Encumbrance. Workflow engine + event bus. |
| **Tue 9** | Bill creation, **three-way match**, payment execution on Arc, double-entry ledger. ← **core demo working by tonight** |
| **Wed 10** | **Vendor risk dashboard** — Graph Token API signals, AI narrative, allowlist gating. ← **second pillar done** |
| **Thu 11** | Vendor portal: auth, PO list, accept/reject/comment, invoice submission. |
| **Fri 12** | Notifications end to end + outbox panel. PDFs. Trial balance. Polish. |
| **Sat 13 AM** | Architecture diagram, README, demo video (2–4 min), submit before 12:00 EDT. |

**Rules:**
- The **smoke test comes before everything.** If Privy↔Arc doesn't work, the whole design changes.
- **Both pillars — match and risk gate — must be working by Wednesday night.** Everything after that is enhancement.
- **Sat 13 morning is not build time.** Video, README, and diagram are graded deliverables.
- If you slip: cut **PDFs first**, then the trial balance, then vendor portal comments. Never cut the match or the risk gate.

---

## 16. Open questions

### ✅ RESOLVED — payment path decided (verified 2026-09-06)

**Use the ERC-20 `transfer()` path. Not native value transfer.**

USDC ERC-20 predeploy on Arc testnet: **`0x3600000000000000000000000000000000000000`**

Verified live against `https://rpc.testnet.arc.io`:

| Check | Result |
|---|---|
| `eth_getCode` | Has code — OpenZeppelin transparent upgradeable proxy (`implementation()`, `upgradeTo()`, `admin()` selectors present) |
| `decimals()` | **6** |
| `symbol()` | `"USDC"` |
| `name()` | `"USDC"` |

Both transfer methods work and share the same underlying balance. **Privy's policy engine supports recipient allowlisting on both:**

```jsonc
// Native transfer — recipient is the `to` field directly
{
  "field_source": "ethereum_transaction",
  "field": "to",
  "operator": "eq",
  "value": "0xVendorAddress"
}

// ERC-20 transfer — `to` is the token contract,
// recipient extracted by decoding calldata against an ABI
{
  "field_source": "ethereum_transaction",
  "field": "to", "operator": "eq",
  "value": "0x3600000000000000000000000000000000000000"
},
{
  "field_source": "ethereum_calldata",
  "field": "transfer.recipient",
  "abi": [ /* transfer(address,uint256) */ ],
  "operator": "eq",
  "value": "0xVendorAddress"
}
```

**Why ERC-20 wins — the decisive argument:**

With a native transfer, the policy's *amount* check operates on the 18-decimal `value` field. A $25,000 per-transaction cap becomes `25000000000000000000000` in the policy config. That drags the decimals trap out of application code and into the security configuration — the worst possible place for a 10¹² error.

With ERC-20, the entire payment path *and* the policy config are 6-decimal, matching business amounts exactly. `$25,000` → `25000000000`. Plus: standard `Transfer` events for indexing, and `approve`/`transferFrom` available later if needed.

**Cost:** slightly more gas, and policies need the ABI. Both trivial.

### ⚠️ PARTIALLY RESOLVED — Privy on Arc

**Strong evidence it works, not yet empirically confirmed.**

Evidence for:
- Server wallets take CAIP-2 `eip155:${number}` with **no documented chain allowlist**
- Privy docs state server wallets "work across all EVM chains"
- Policy engine uses `chain_type: "ethereum"` — a **type**, not an enumerated chain list — with `chain_id` inside conditions. Chain-agnostic by design.
- Policy engine documented as available across EVM-compatible chains

**The precise residual risk: broadcast, not signing.** Privy must be able to *submit* the signed transaction to Arc. If Privy maintains its own RPC endpoints per known chain, an unrecognised chain ID could fail at the broadcast step even though the policy layer is chain-agnostic. `addRpcUrlOverrideToChain` exists for `@privy-io/react-auth` (client-side); **no server-wallet equivalent found in the docs.**

**Fallback if broadcast fails — the design survives:**

Have the Privy server wallet **sign only** (`signTransaction`, not `sendTransaction`), then broadcast the raw signed transaction ourselves via viem against `https://rpc.testnet.arc.io`. The policy engine still evaluates at signing time, so **both control layers remain intact** — we just move the broadcast step in-house.

Verify `signTransaction` exists for server wallets when testing.

### Remaining open questions

| # | Question | Why it matters | How to resolve |
|---|---|---|---|
| 1 | Can Privy server wallets **broadcast** to `eip155:5042002`? | If not, use the sign-only fallback above | Smoke test + email support@privy.io |
| 2 | Does `signTransaction` exist for server wallets? | It's the fallback path | Privy API reference |
| 3 | Does Resend restrict unverified accounts to the signup address? | Determines demo email addressing | Sign up and try |
| 4 | Graph Token API auth + exact endpoints for transfer history | Risk feature depends on it | The Graph Market dashboard |
| 5 | Onchain contracts — needed, or is Privy + DB enough? | Arc tracks may expect deployed contracts; "PO registry onchain" is currently aspirational | Decide after smoke test |

---

## 17. Submission checklist

Collected across all four sponsors:

- [ ] Public GitHub repo
- [ ] **Detailed documentation** (README a judge can run from)
- [ ] **Architecture diagram** — Arc requires this on every track
- [ ] **Demo video, 2–4 minutes** — Graph's cap is tightest; cut to it and it serves all tracks
- [ ] "Privy's role" section naming each primitive and where it's used
- [ ] Working frontend **and** backend demonstrated (Arc requirement)
- [ ] Graph limitations stated honestly (180-day window)
- [ ] Deployed on Arc testnet, contracts verifiable
- [ ] Arc mainnet deployment or deployment-ready by **30 Sep**
- [ ] Submitted to: Privy ×2, Arc ×2, Graph ×1

### Demo video script (2–4 min)

| Time | Beat |
|---|---|
| 0:00 | *"Three documents have to agree. Then it pays itself."* |
| 0:15 | Controller sets policy: Engineering $50k, >$10k needs 2-of-3, allowlisted vendors only |
| 0:35 | **Vendor onboarding — Graph risk dossier + AI narrative. Low score → blocked, never enters allowlist.** |
| 1:00 | Engineer raises $12,000 request |
| 1:15 | Approver A signs → **nothing happens** |
| 1:30 | Approver B signs → PO issued, **budget encumbered** |
| 1:45 | Vendor portal: accepts PO. Receipt confirmed. Vendor invoices **$13,500** |
| 2:05 | **MISMATCH. Payment blocked.** ← money shot |
| 2:25 | Corrected → match passes → **USDC releases automatically** |
| 2:45 | **Bypass the app, sign directly → Privy policy blocks it anyway** ← architecture shot |
| 3:05 | Journal entries, trial balance, tx hash as reconciliation key |
| 3:20 | Outbox — every email the workflow fired |
| 3:35 | Close on the thesis |

**Say "three-way match" and "GR/IR clearing" out loud.** Judges evaluating a B2B financial product will immediately register domain fluency — and almost nobody else in that room will have it.
