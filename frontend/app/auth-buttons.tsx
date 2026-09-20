"use client";

import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Sign in / out.
 *
 * After either, we refresh the route so server components re-read the
 * `privy-token` cookie — the session is resolved on the server, not held
 * in client state.
 */
export function SignInButton() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <button
        disabled
        className="rounded-md bg-slate-200 px-4 py-2 text-[13px] font-medium text-slate-500"
      >
        Loading…
      </button>
    );
  }

  if (authenticated) {
    return (
      <button
        onClick={() => router.refresh()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
      >
        Continue
      </button>
    );
  }

  return (
    <button
      onClick={login}
      className="rounded-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
    >
      Sign in with Privy
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const { logout } = usePrivy();

  return (
    <button
      onClick={async () => {
        await logout();
        router.refresh();
      }}
      className="text-[12px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
    >
      Sign out
    </button>
  );
}

/**
 * Privy authenticates on the client but the session lives in a cookie the
 * server reads. Immediately after login the server hasn't seen it yet, so
 * nudge a refresh once.
 */
export function SyncOnLogin({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  if (ready && authenticated && !signedIn) {
    setTimeout(() => router.refresh(), 250);
  }
  return null;
}
