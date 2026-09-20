"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { arcTestnet } from "@/lib/chain";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div className="mx-auto max-w-lg px-8 py-16 text-[13px] text-red-900">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="font-medium">NEXT_PUBLIC_PRIVY_APP_ID is not set</div>
          <p className="mt-1 text-[12px]">
            Add it to <span className="mono">.env.local</span> and restart the
            dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        // Every member needs a wallet of their own: an approval is a
        // signature from it, and the key must be theirs rather than ours.
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
        appearance: {
          theme: "light",
          accentColor: "#4f46e5",
          logo: undefined,
          walletList: [],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
