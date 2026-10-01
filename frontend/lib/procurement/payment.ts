import { BillStatus, PaymentStatus } from "@prisma/client";
import { recoverTypedDataAddress, getAddress, erc20Abi } from "viem";
import { db } from "../db";
import { publicClient, USDC_ADDRESS } from "../chain";
import {
  approvalTypedData,
  orgKey,
  poKey,
  readRegistry,
  registryAddress,
  sendFromTreasury,
} from "../registry";
import { runThreeWayMatch } from "./three-way";
import { postPayment } from "../ledger/post";

/**
 * Releasing money.
 *
 * Nothing here decides whether to pay. The match decided that, the
 * approvers signed for it, and the contract is what enforces both. This
 * assembles the evidence and hands it to Arc, which either transfers the
 * USDC or reverts — and a revert is a correct outcome, not an error to
 * be worked around.
 *
 * The app re-checks everything the contract checks before submitting.
 * Not because the contract can't be trusted — it's the only thing that
 * can — but because "reverted: BelowThreshold" is a worse thing to show
 * someone than "one more approver needs to sign", and burning gas to
 * discover it is worse still.
 */

export type PayResult =
  | { ok: true; txHash: `0x${string}`; blockNumber: bigint; amountMinor: bigint }
  | { ok: false; error: string; reverted?: boolean };

/**
 * Signatures, ordered by recovered address.
 *
 * The contract demands strictly ascending order — that is how the same
 * approval is stopped from being counted twice. We must recover here
 * anyway to sort, which makes the ordering a property of the data
 * rather than something the caller has to remember.
 */
async function orderedSignatures(
  requestId: string,
  level: number,
  amountMinor: bigint,
): Promise<{ signer: string; signature: `0x${string}` }[]> {
  const approvals = await db.approval.findMany({
    where: { requestId, approved: true, signature: { not: null } },
    select: { signature: true, level: true },
  });

  const typed = approvalTypedData(poKey(requestId), level, amountMinor, 1n);
  const out: { signer: string; signature: `0x${string}` }[] = [];

  for (const a of approvals) {
    if (a.level !== level) continue;
    try {
      const signer = await recoverTypedDataAddress({
        domain: typed.domain,
        types: typed.types,
        primaryType: typed.primaryType,
        message: typed.message,
        signature: a.signature as `0x${string}`,
      } as Parameters<typeof recoverTypedDataAddress>[0]);
      out.push({ signer: getAddress(signer), signature: a.signature as `0x${string}` });
    } catch {
      // A signature that no longer recovers is one the contract would
      // reject too. Dropping it here produces "not enough signatures",
      // which is the truth, instead of an opaque revert.
    }
  }

  const seen = new Set<string>();
  return out
    .filter((s) => (seen.has(s.signer) ? false : (seen.add(s.signer), true)))
    .sort((a, b) =>
      BigInt(a.signer) < BigInt(b.signer) ? -1 : BigInt(a.signer) > BigInt(b.signer) ? 1 : 0,
    );
}

/** Everything the contract will check, checked first so the failure is legible. */
export async function payabilityReport(billId: string) {
  const bill = await db.bill.findUnique({
    where: { id: billId },
    include: {
      order: {
        include: {
          vendor: true,
          receipt: true,
          invoice: true,
          request: { select: { id: true, currentLevel: true } },
        },
      },
      payment: true,
    },
  });
  if (!bill) return null;

  const key = orgKey(bill.orgId);
  const po = poKey(bill.order.requestId);
  const match = runThreeWayMatch(bill.order);

  const registry = registryAddress();
  let onchain: {
    committed: boolean;
    paid: boolean;
    vendorAllowed: boolean;
    budget: bigint;
    threshold: number;
  } | null = null;

  if (registry) {
    try {
      const [order, allowed, budget, threshold] = await Promise.all([
        readRegistry<[string, bigint, string, boolean, boolean]>("orders", [po]),
        readRegistry<boolean>("vendorAllowed", [key, bill.order.vendor.payoutAddress]),
        readRegistry<bigint>("budget", [key]),
        readRegistry<number>("threshold", [key, 1]),
      ]);
      onchain = {
        committed: order[4],
        paid: order[3],
        vendorAllowed: allowed,
        budget,
        threshold: Number(threshold),
      };
    } catch {
      onchain = null;
    }
  }

  const sigs = await orderedSignatures(
    bill.order.requestId,
    1,
    bill.order.amountMinor,
  );

  return { bill, match, onchain, signatures: sigs, registry };
}

/**
 * Execute. Signed by the treasury via Privy, broadcast by us.
 */
export async function payBill(billId: string): Promise<PayResult> {
  const report = await payabilityReport(billId);
  if (!report) return { ok: false, error: "Unknown bill." };
  const { bill, match, onchain, signatures } = report;

  if (!report.registry) {
    return { ok: false, error: "No registry is configured for this deployment." };
  }
  if (bill.payment?.status === PaymentStatus.CONFIRMED) {
    return { ok: false, error: "This bill has already been paid." };
  }
  if (bill.status !== BillStatus.MATCHED || !match.passed) {
    return {
      ok: false,
      error: `The three-way match is failing — ${match.reason}. Payment is unreachable until it passes.`,
    };
  }
  if (onchain && !onchain.committed) {
    return {
      ok: false,
      error: "This order was never committed on Arc, so the contract has nothing to pay against. Re-issue it or run the backfill.",
    };
  }
  if (onchain?.paid) {
    return { ok: false, error: "Arc says this order is already paid." };
  }
  if (onchain && !onchain.vendorAllowed) {
    return {
      ok: false,
      error: `${bill.order.vendor.name}'s payout address is not on the Arc allowlist. Activate the vendor to add it.`,
    };
  }
  if (onchain && bill.order.amountMinor > onchain.budget) {
    return {
      ok: false,
      error: `On-chain budget is short — the contract holds ${Number(onchain.budget) / 1e6} USDC and this needs ${Number(bill.order.amountMinor) / 1e6}.`,
    };
  }
  if (onchain && signatures.length < onchain.threshold) {
    return {
      ok: false,
      error:
        onchain.threshold === 0
          ? "No approver set is registered on Arc for level 1. Save the approval flow to register it — until then the contract will not release anything."
          : `Arc requires ${onchain.threshold} signature${onchain.threshold === 1 ? "" : "s"} and ${signatures.length} usable one${signatures.length === 1 ? " is" : "s are"} on file. Approvals given before signing was enabled don't carry one.`,
    };
  }

  const org = await db.organization.findUnique({
    where: { id: bill.orgId },
    select: { treasuryWalletId: true, treasuryAddress: true },
  });
  if (!org?.treasuryWalletId || !org.treasuryAddress) {
    return { ok: false, error: "The organisation has no treasury wallet." };
  }

  // The registry pulls from the treasury, so the allowance has to cover
  // it. Checked here because "ERC20: insufficient allowance" inside a
  // revert tells the user nothing they can act on.
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [org.treasuryAddress as `0x${string}`, registryAddress()!],
  });
  if (allowance < bill.order.amountMinor) {
    return {
      ok: false,
      error: `The treasury has approved only ${Number(allowance) / 1e6} USDC for the registry to spend, and this needs ${Number(bill.order.amountMinor) / 1e6}.`,
    };
  }

  const payment = await db.payment.upsert({
    where: { billId: bill.id },
    create: {
      billId: bill.id,
      status: PaymentStatus.PENDING,
      amountMinor: bill.order.amountMinor,
      fromAddress: org.treasuryAddress,
      toAddress: bill.order.vendor.payoutAddress,
    },
    update: { status: PaymentStatus.PENDING, failReason: null },
  });

  try {
    const tx = await sendFromTreasury(
      org.treasuryWalletId,
      org.treasuryAddress,
      "executePayment",
      [
        orgKey(bill.orgId),
        poKey(bill.order.requestId),
        1,
        1n,
        signatures.map((s) => s.signature),
      ],
    );

    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.CONFIRMED,
          txHash: tx.hash,
          blockNumber: tx.blockNumber,
          confirmedAt: new Date(),
        },
      }),
      db.bill.update({
        where: { id: bill.id },
        data: { status: BillStatus.PAID },
      }),
    ]);

    // Dr Payables, Cr Cash — carrying the Arc hash, so reconciling the
    // ledger against the chain is a join rather than an exercise.
    await postPayment(payment.id);

    return {
      ok: true,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      amountMinor: bill.order.amountMinor,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED, failReason: message.slice(0, 500) },
    });
    return { ok: false, error: message, reverted: /revert/i.test(message) };
  }
}
