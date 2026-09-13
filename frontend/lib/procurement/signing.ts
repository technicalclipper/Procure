import { verifyTypedData, getAddress } from "viem";
import { db } from "../db";
import { approvalTypedData, poKey, registryAddress } from "../registry";

/**
 * What an approver signs, and how we check it.
 *
 * The digest names the order, the level and the amount, and the contract
 * reads the amount back from the order it committed at issue time — so a
 * signature approving $5,000 cannot pay $50,000, and a signature for one
 * order cannot pay another. Neither is caught later; the digest simply
 * doesn't match and recovery yields a different address.
 *
 * An approval is signed against the *order*, which does not exist when
 * the request is still being approved. The poHash is derived from the
 * request id instead, and the order takes that same key when it is
 * issued — so the thing signed for and the thing committed are one.
 */

/** The order key a request will have once issued. */
export function requestPoKey(requestId: string) {
  return poKey(requestId);
}

export async function buildApprovalPayload(requestId: string) {
  if (!registryAddress()) return null;

  const pr = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    select: { amountMinor: true, currentLevel: true },
  });
  if (!pr) return null;

  return approvalTypedData(
    requestPoKey(requestId),
    pr.currentLevel,
    pr.amountMinor,
    // One nonce per request. Replay across orders is already impossible
    // because poHash is in the digest, and the contract refuses to pay
    // the same order twice regardless.
    1n,
  );
}

/**
 * Serialised for a client component — BigInt cannot cross the boundary.
 *
 * EIP712Domain is spelled out here. viem injects it when hashing, which
 * is why server-side verification works without it, but a wallet gets
 * this object handed straight to eth_signTypedData_v4, and the JSON-RPC
 * schema requires the domain's own type to be declared. Leaving it to
 * the library is the difference between a signing prompt and a rejected
 * request.
 */
export async function buildApprovalPayloadForClient(requestId: string) {
  const t = await buildApprovalPayload(requestId);
  if (!t) return null;
  return {
    domain: t.domain as unknown as Record<string, unknown>,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...(t.types as unknown as Record<
        string,
        { name: string; type: string }[]
      >),
    },
    primaryType: t.primaryType,
    message: {
      poHash: t.message.poHash,
      level: t.message.level,
      amount: t.message.amount.toString(),
      nonce: t.message.nonce.toString(),
    },
  };
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyApprovalSignature(
  requestId: string,
  walletAddress: string | null,
  signature: string,
): Promise<SignatureCheck> {
  if (!walletAddress) {
    return {
      ok: false,
      error:
        "Your account has no wallet address yet, so the signature can't be attributed. Sign out and back in to provision one.",
    };
  }

  const typed = await buildApprovalPayload(requestId);
  if (!typed) return { ok: true }; // no registry configured — nothing to verify against

  let valid = false;
  try {
    valid = await verifyTypedData({
      address: getAddress(walletAddress),
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
      signature: signature as `0x${string}`,
    } as Parameters<typeof verifyTypedData>[0]);
  } catch (e) {
    return {
      ok: false,
      error: `Signature could not be checked: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!valid) {
    return {
      ok: false,
      error:
        "That signature doesn't match your wallet for this request. Nothing was recorded.",
    };
  }
  return { ok: true };
}
