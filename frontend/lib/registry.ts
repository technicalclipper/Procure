import { encodeFunctionData, keccak256, toHex, getAddress } from "viem";
import { publicClient } from "./chain";
import { signTransaction } from "./privy";
import abi from "./registry-abi.json";

/**
 * ProcureRegistry — the on-chain half.
 *
 * Every write here is signed by the org's own treasury wallet through
 * Privy and broadcast by us. Arc refuses `eth_sendTransaction`, so the
 * split is deliberate: Privy holds the key and evaluates its policy,
 * we own the RPC. Both control layers stay intact.
 */

export const REGISTRY_ABI = abi;

export function registryAddress(): `0x${string}` | null {
  const a = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  return a ? (getAddress(a) as `0x${string}`) : null;
}

/** Org and order identifiers are hashes of our ids — stable, and they
 *  leak nothing about the organisation on a public chain. */
export function orgKey(orgId: string): `0x${string}` {
  return keccak256(toHex(`procure:org:${orgId}`));
}

export function poKey(orderId: string): `0x${string}` {
  return keccak256(toHex(`procure:po:${orderId}`));
}

/** Commits the documents the approvers are signing about. */
export function matchHash(parts: {
  poNumber: string;
  grnNumber: string;
  invoiceNumber: string;
  invoicedMinor: bigint;
}): `0x${string}` {
  return keccak256(
    toHex(
      `${parts.poNumber}|${parts.grnNumber}|${parts.invoiceNumber}|${parts.invoicedMinor}`,
    ),
  );
}

export type SentTx = { hash: `0x${string}`; blockNumber: bigint };

/**
 * Sign with Privy, broadcast ourselves, wait for the receipt.
 *
 * Serialised on the treasury's nonce by the caller: two writes racing
 * for the same nonce means one silently never lands, which is worse
 * than being slow.
 */
export async function sendFromTreasury(
  walletId: string,
  from: string,
  functionName: string,
  args: unknown[],
): Promise<SentTx> {
  const to = registryAddress();
  if (!to) throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not set");

  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);

  const [nonce, gasPrice] = await Promise.all([
    publicClient.getTransactionCount({ address: from as `0x${string}` }),
    publicClient.getGasPrice(),
  ]);

  // Estimate against the real state so a call that would revert fails
  // here, before it costs gas and before we tell a user it succeeded.
  const gas = await publicClient.estimateGas({
    account: from as `0x${string}`,
    to,
    data,
  });

  const signed = await signTransaction(walletId, {
    to,
    data,
    chain_id: 5042002,
    nonce,
    gas_limit: Number((gas * 13n) / 10n),
    max_fee_per_gas: "0x" + (gasPrice * 2n).toString(16),
    max_priority_fee_per_gas: "0x" + gasPrice.toString(16),
  });

  const hash = await publicClient.sendRawTransaction({
    serializedTransaction: signed,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted on Arc: ${hash}`);
  }
  return { hash, blockNumber: receipt.blockNumber };
}

/* ── reads ─────────────────────────────────────────────────────────── */

export async function readRegistry<T>(
  functionName: string,
  args: unknown[],
): Promise<T> {
  const address = registryAddress();
  if (!address) throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not set");
  return publicClient.readContract({
    address,
    abi: REGISTRY_ABI as never,
    functionName,
    args: args as never,
  }) as Promise<T>;
}

/** The EIP-712 payload an approver signs. Built from the contract's own
 *  domain so the app can never drift from what it will verify. */
export function approvalTypedData(
  poHash: `0x${string}`,
  level: number,
  amountMinor: bigint,
  nonce: bigint,
) {
  const verifyingContract = registryAddress();
  if (!verifyingContract) throw new Error("registry address missing");
  return {
    domain: {
      name: "Procure",
      version: "1",
      chainId: 5042002,
      verifyingContract,
    },
    types: {
      Approval: [
        { name: "poHash", type: "bytes32" },
        { name: "level", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Approval" as const,
    message: { poHash, level, amount: amountMinor, nonce },
  };
}
