import Link from "next/link";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { SignOutButton } from "@/app/auth-buttons";
import type { SessionUser } from "@/lib/session";

/**
 * Vendor portal chrome.
 *
 * Deliberately not the org app: teal rather than indigo, no sidebar. A
 * vendor is outside the buying organisation, and the switch between the
 * two views has to be unmistakable in a single frame.
 */
export function VendorShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-teal-200 bg-teal-50">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-4">
          <Link href="/vendor" className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
              Vendor portal
            </div>
            <div className="text-[19px] font-semibold tracking-tight text-slate-900">
              Procure
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[12px] text-slate-900">{user.email}</div>
              {user.walletAddress && (
                <a
                  href={explorerAddress(user.walletAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-[11px] text-teal-700 hover:underline"
                  title={user.walletAddress}
                >
                  {shortAddress(user.walletAddress)} ↗
                </a>
              )}
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-8 py-8">{children}</main>
    </div>
  );
}
