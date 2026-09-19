import { createPublicClient, defineChain, http, erc20Abi } from "viem";

/**
 * Arc testnet — Circle's L1 for stablecoin finance.
 *
 * Verified live 2026-09-06:
 *   eth_chainId  -> 0x4cef52 (5042002)
 *   eth_gasPrice -> 0x4e3b29200 (21e9), i.e. 18-decimal native accounting
 *
 * NOTE on `nativeCurrency.decimals`: Arc denominates fees in USDC, but the
 * native gas accounting is 18 decimals while the USDC ERC-20 interface is 6.
 * viem uses this field to format values from eth_getBalance / eth_gasPrice,
 * all of which speak the 18-decimal representation. So 18 is correct here —
 * it is NOT the decimals used for USDC transfers. See lib/units.ts.
 */
export const arcTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? 5042002),
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

/** CAIP-2 identifier — what Privy's `eth_sendTransaction` expects. */
export const ARC_CAIP2 = `eip155:${arcTestnet.id}` as const;

/**
 * USDC ERC-20 predeploy. Verified live: decimals()=6, symbol()="USDC",
 * behind an OpenZeppelin transparent upgradeable proxy.
 *
 * We pay via ERC-20 transfer(), NOT native value transfer — it keeps the
 * whole payment path and the Privy policy config in 6 decimals.
 */
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as `0x${string}`;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

/** USDC balance of an address, in 6-decimal base units. */
export async function usdcBalanceOf(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
}

/** Several balances at once, tolerating individual failures. */
export async function usdcBalances(
  addresses: (string | null | undefined)[],
): Promise<Record<string, bigint | null>> {
  const out: Record<string, bigint | null> = {};
  await Promise.all(
    addresses.filter(Boolean).map(async (a) => {
      try {
        out[a as string] = await usdcBalanceOf(a as string);
      } catch {
        out[a as string] = null;
      }
    }),
  );
  return out;
}

export function explorerTx(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${arcTestnet.blockExplorers.default.url}/address/${address}`;
}

/** 0x1234…abcd */
export function shortAddress(address?: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
