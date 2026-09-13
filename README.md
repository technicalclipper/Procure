# Procure

**Crypto-native procurement. The approval is the payment.**

A multi-tenant B2B procure-to-pay system for onchain companies — purchase requests, approvals, purchase orders, goods receipt, vendor invoicing, three-way match, and settlement in USDC on Arc.

The thesis in one line:

> **An invoice that doesn't match its purchase order cannot be paid — not by policy, by construction.**

Most spend-management software enforces that rule in application code, which means it holds exactly as long as the application does. Here the rule lives in a contract: `executePayment` recovers the approvers' signatures, checks them against an on-chain approver set, checks the vendor allowlist and the budget, and reverts if any of it fails. Compromise the server and you still cannot pay an unapproved vendor an unapproved amount.

---

## Live deployment

| | |
|---|---|
| **`ProcureRegistry`** | [`0xa033ac540710763422618453C80AA026c0FE11f0`](https://testnet.arcscan.app/address/0xa033ac540710763422618453C80AA026c0FE11f0) |
| Chain | Arc testnet (`5042002`) — USDC is the gas token |
| USDC | `0x3600000000000000000000000000000000000000` |
| Contract tests | 14 passing, mostly revert paths |

---

## The problem

A company with an onchain treasury has no way to run procurement without trusting a person or a server. Multisigs authorise *transfers*, not *purchases* — a Safe signer approving a transaction has no idea whether the goods arrived or whether the invoice matches what was ordered. Meanwhile ERP systems know all of that and enforce none of it cryptographically.

Procure puts the procurement controls where the money is.

## The three-way match

Three documents, produced by three different parties at three different times, none able to produce the others. That separation is the control.

| Leg | Document | Created by |
|---|---|---|
| 1 | Purchase order | Purchaser, from an approved request |
| 2 | Goods receipt | A **requester** in that department |
| 3 | Vendor invoice | The vendor, in their own portal |

Five checks run, and **none short-circuits** — because *"the invoice is $2,000 over AND the vendor was blocked since you ordered"* is a different conversation from either fact alone:

- Purchase order is live
- Goods receipted — who confirmed it, when
- Vendor invoice received
- **Vendor is payable now** — not merely when you ordered
- **Invoiced amount agrees** — within the tolerance the order was issued under

Two decisions that make this real rather than theatre:

**Nothing is prefilled from the PO.** The vendor types their own invoice number and amount in their portal. A bill assembled from the purchase order would agree with itself by construction.

**Receipt can't be done by whoever pays.** Only a requester in that department or a controller. One person raising the order, booking it in and releasing payment is the oldest fraud in accounts payable.

## How approvals work

Approvers sign; they never send a transaction.

```
Once, at setup    admin saves an approval level
                  → setApprovers() writes the set and threshold to Arc

Every request     Alice clicks Approve
                  → her Privy wallet signs an EIP-712 struct naming
                    the order, level and amount
                  → free, instant, no gas, no transaction

At payment        one transaction carries every signature
                  → the contract recovers each one, checks it against
                    the on-chain approver set, counts against threshold
                  → transfers USDC, or reverts
```

It's a cheque. You sign at your desk; the bank verifies at the counter.

**Why not one transaction per approval?** Arc charges gas in USDC. Every approver's wallet would need funding before they could act — invite three approvers and none of them can do anything until someone tops up three wallets. Signing off-chain costs nothing and the chain still does the enforcing. It's what Safe does, for the same reason.

## What the contract enforces

```solidity
executePayment(org, poHash, level, nonce, signatures[])
  ├── order was committed on-chain at issue time
  ├── not already paid                    (replay)
  ├── payee is on the vendor allowlist    (risk screening)
  ├── amount within the org's budget
  ├── every signature recovers to a registered approver
  ├── signatures strictly ascending by address  (no double-counting)
  ├── count >= threshold, and threshold > 0
  └── USDC.transferFrom(treasury, payee, amount)
```

`poHash` and `amount` are **inside the signed digest**, so a signature approving PO-0001 for $5,000 cannot pay PO-0002, cannot pay a different vendor, and cannot pay $50,000. Change any of it and recovery yields a different address.

`orgAdmin` is the org's own treasury wallet, claimed first-come with no reassignment. If our server could write the approver set, we could add ourselves to it and every guarantee above would be decoration.

### What it deliberately does not claim

The contract **cannot verify that goods arrived** or that an invoice is genuine. Those are assertions the approvers sign *about*. What it enforces is that the approvers this org registered, in sufficient number, signed for exactly this payee and this amount against this order, once, within budget, to a screened vendor.

That's an oracle boundary, not a design flaw — but it's stated here rather than left for a judge to find.

## Vendor risk assessment (The Graph)

Every vendor payout address is screened through [Pinax's Token API](https://pinax.network) across Ethereum mainnet, Base and Arbitrum before it can receive money. Six weighted signals produce a 0–100 score and a band: **CLEAR**, **REVIEW**, or **BLOCKED**. A blocked vendor is removed from the on-chain allowlist, so the screening is a rule the chain keeps rather than advice someone can click past.

Two things the model had to survive, both found by testing it against real addresses:

**Airdrop spam faked legitimacy.** An unused vanity address scored 100 — worthless tokens sprayed at it looked like counterparty diversity and holdings. Fixed by screening on stablecoins only.

**Address poisoning still faked it.** It scored 100 again. Poisoning attacks send *genuine* sub-dollar USDC to lookalike addresses, which stablecoin-only screening happily counted. Fixed with a $10 dust floor.

Final spread across real addresses: Circle treasury 88, Vitalik 100, a poisoned vanity address 60, a never-used address 47.

The counterparty graph renders in 3D. Dust counterparties are hidden by default — except when there are fewer than three commercial ones, because then the dust *is* the finding.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 · React 19 · server actions · Tailwind          │
│                                                              │
│  /o/[slug]/…          org app, role-gated sidebar            │
│  /vendor/…            vendor portal (separate chrome)        │
└───────────────┬──────────────────────────┬──────────────────┘
                │                          │
      ┌─────────▼─────────┐      ┌─────────▼──────────┐
      │  Postgres/Prisma  │      │  Privy             │
      │  documents,       │      │  auth (email OTP)  │
      │  workflow state,  │      │  embedded wallets  │
      │  audit trail      │      │  server wallets    │
      └─────────┬─────────┘      │  policy engine     │
                │                └─────────┬──────────┘
                │                          │ signs
                │                          ▼
                │             ┌────────────────────────┐
                └────────────►│  Arc testnet           │
                  we broadcast│  ProcureRegistry       │
                              │  USDC (gas + payment)  │
                              └────────────────────────┘
                                          ▲
      ┌────────────────────┐              │ screens vendors
      │  The Graph         │──────────────┘
      │  Token API         │
      │  mainnet/base/arb  │
      └────────────────────┘
```

**Why Privy signs but doesn't broadcast.** Verified empirically: `eth_sendTransaction` with `caip2: eip155:5042002` returns **401 "App is not authorized to transact on chain"**, while a control call on Base Sepolia reaches broadcast — so it's per-chain authorisation, not a bad request. `eth_signTransaction` with `chain_id` *inside* the transaction returns signed RLP, and the policy engine still evaluates (a disallowed recipient returns 400 "RPC request denied due to policy violation").

So Privy holds the key and enforces policy; we own the RPC. Both control layers stay intact.

## Notes from building this

**Arc counts USDC two ways.** Native gas accounting is 18 decimals; the USDC ERC-20 is 6. Same asset, two scales, and mixing them is a factor of 10¹². `lib/units.ts` brands them as distinct TypeScript types so mixing is a compile error rather than a discovery.

**Default-open is the wrong default for spend authority.** Found by running the attack rather than trusting the test suite: with no approvers configured, `threshold` was 0, so `valid >= need` was `0 >= 0` and an **empty signature array paid out**. An org that had never configured approvals could be drained by anyone who could call `executePayment`. Fixed with `NoApproverSet`, redeployed, and the same probe that paid against the old address is refused by the new one.

**Approvals are keyed by the request, not the order.** Approvers sign before an order exists, so `commitOrder` writes under that same key. Keyed by order id, every signature would name a `poHash` the contract had never heard of and no payment could ever verify.

**Privy's EIP-712 endpoint is snake_case.** It requires `primary_type` and rejects `primaryType` outright. Everything else passes through, so a viem typed-data object works as-is apart from that one key.

## Running it

```bash
cd frontend
npm install
cp .env.example .env.local   # Privy, Postgres, Pinax, Resend keys
npx dotenv -e .env.local -- npx prisma migrate deploy
npx dotenv -e .env.local -- npx prisma generate
npm run dev
```

```bash
cd contracts
forge test
forge create src/ProcureRegistry.sol:ProcureRegistry \
  --rpc-url https://rpc.testnet.arc.io \
  --broadcast --constructor-args 0x3600000000000000000000000000000000000000
```

After deploying, set `NEXT_PUBLIC_REGISTRY_ADDRESS`, have the treasury call `registerOrg`, and approve the registry to spend USDC.

## Status

Built: multi-tenant orgs, invitations, departments and budgets, chart of accounts, vendors with Graph risk screening, items, configurable approval flows, purchase requests, signed approvals, purchase orders, vendor portal, goods receipt, vendor invoicing, three-way match, and USDC settlement on Arc.

Not built: double-entry ledger and trial balance (the chart of accounts and `GR/IR Clearing` account are seeded and waiting), document PDFs.

Quantity-level matching is not implemented — the receipt confirms an order wholesale rather than per line, so matching is **value-level**. A per-line quantity match would additionally catch "delivered 8, invoiced 10".
