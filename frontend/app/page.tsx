import { getSessionUser } from "@/lib/session";
import { explorerAddress, shortAddress } from "@/lib/chain";
import { SignInButton, SignOutButton, SyncOnLogin } from "./auth-buttons";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <SyncOnLogin signedIn={false} />
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            Procure
          </div>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight text-slate-900">
            The approval is the payment.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Procure-to-pay for onchain companies. Risk-screened vendors,
            quorum approvals, three-way match, and automatic USDC settlement
            on Arc — where spend controls are enforced by the treasury
            itself, not by software sitting next to it.
          </p>

          <ul className="mt-8 space-y-2.5 text-[13px] text-slate-600">
            <Bullet>
              An invoice that doesn&apos;t match the purchase order{" "}
              <span className="font-medium text-slate-900">cannot be paid</span>
              {" "}— not by policy, by construction.
            </Bullet>
            <Bullet>
              Every department holds its own wallet, funded to exactly its
              budget.
            </Bullet>
            <Bullet>
              Approvals are signatures from your own wallet, not rows in
              someone&apos;s database.
            </Bullet>
          </ul>

          <div className="mt-10">
            <SignInButton />
            <p className="mt-3 text-[12px] text-slate-500">
              Sign in with your email. A wallet is created for you
              automatically — no seed phrase, no extension.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SyncOnLogin signedIn />
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-4">
            <div className="text-[15px] font-semibold tracking-tight">
              Procure
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[12px] text-slate-900">{user.email}</div>
                {user.walletAddress && (
                  <a
                    href={explorerAddress(user.walletAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-[11px] text-indigo-600 hover:underline"
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

        <main className="mx-auto max-w-3xl px-8 py-10">
          <h1 className="text-[19px] font-semibold tracking-tight">
            Your organisations
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Create one, or accept an invitation to join an existing
            organisation.
          </p>

          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-[13px] font-medium text-slate-900">
              You don&apos;t belong to any organisation yet
            </div>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500">
              Creating one sets up a treasury wallet and a starter chart of
              accounts. You can add departments and invite people after.
            </p>
            <button
              disabled
              title="Arrives in the next step"
              className="mt-5 rounded-md bg-slate-200 px-4 py-2 text-[13px] font-medium text-slate-500"
            >
              Create organisation
            </button>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Signed in as
            </div>
            <dl className="space-y-1.5 text-[12px]">
              <Row label="Email" value={user.email} />
              <Row
                label="Wallet"
                value={user.walletAddress ?? "provisioning…"}
                mono
              />
              <Row label="Privy DID" value={user.privyDid} mono />
            </dl>
          </div>
        </main>
      </div>
    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
      <span>{children}</span>
    </li>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-all text-slate-900 ${mono ? "mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
