import { cookies } from "next/headers";
import { PrivyClient } from "@privy-io/server-auth";
import { db } from "./db";

/**
 * Server-side session.
 *
 * The Privy React SDK stores the access token in a `privy-token` cookie.
 * We verify it locally (ES256, verification key cached by the SDK) to get
 * the DID, then resolve our own User row from it.
 *
 * getUserById is only called when we need details we don't have yet —
 * first sign-in, or a wallet that hadn't been created at first sign-in.
 * Verifying every request is cheap; fetching the profile every request
 * is not.
 */

function clean(s: string | undefined) {
  // Dashboard copy-paste can carry invisible characters; a trailing U+2028
  // presents as a flat 401 and is impossible to spot in an editor.
  return (s ?? "").replace(/[^\x20-\x7e]/g, "").trim();
}

let client: PrivyClient | null = null;
function privyClient() {
  if (client) return client;
  const appId = clean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const secret = clean(process.env.PRIVY_APP_SECRET);
  if (!appId || !secret) {
    throw new Error(
      "Privy credentials missing — set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET",
    );
  }
  client = new PrivyClient(appId, secret);
  return client;
}

export type SessionUser = {
  id: string;
  privyDid: string;
  email: string;
  name: string | null;
  walletAddress: string | null;
};

/** Pull email + embedded wallet from the Privy profile. */
async function profileFor(did: string) {
  const privyUser = await privyClient().getUserById(did);

  const email =
    privyUser.email?.address ??
    privyUser.google?.email ??
    privyUser.linkedAccounts.find(
      (a): a is typeof a & { address: string } =>
        a.type === "email" && "address" in a,
    )?.address ??
    null;

  const embedded = privyUser.linkedAccounts.find(
    (a): a is typeof a & { address: string } =>
      a.type === "wallet" &&
      "walletClientType" in a &&
      a.walletClientType === "privy",
  );

  const anyWallet = privyUser.wallet?.address ?? null;

  return {
    email,
    walletAddress: embedded?.address ?? anyWallet,
  };
}

/**
 * Current user, or null when signed out.
 *
 * Creates the User row on first sign-in — this is what turns a Privy
 * identity into a member of the system. Never throws on a bad or expired
 * token; it just reads as signed out.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get("privy-token")?.value;
  if (!token) return null;

  let did: string;
  try {
    const claims = await privyClient().verifyAuthToken(token);
    did = claims.userId;
  } catch {
    return null;
  }

  const existing = await db.user.findUnique({ where: { privyDid: did } });

  if (existing) {
    // The embedded wallet may not have existed at first sign-in.
    if (!existing.walletAddress) {
      const { walletAddress } = await profileFor(did);
      if (walletAddress) {
        const updated = await db.user.update({
          where: { id: existing.id },
          data: { walletAddress, lastSeenAt: new Date() },
        });
        return toSession(updated);
      }
    }
    // Fire-and-forget freshness; not worth blocking the render.
    void db.user
      .update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
    return toSession(existing);
  }

  const { email, walletAddress } = await profileFor(did);
  if (!email) {
    // Without an email we can't match invitations, which are keyed on it.
    return null;
  }

  // An invited user may already exist as a row keyed on email but with no
  // DID yet — claim it rather than creating a duplicate.
  const byEmail = await db.user.findUnique({ where: { email } });
  if (byEmail) {
    const claimed = await db.user.update({
      where: { id: byEmail.id },
      data: { privyDid: did, walletAddress, lastSeenAt: new Date() },
    });
    return toSession(claimed);
  }

  // Sign-in fires several requests at once (the page render plus the
  // post-login refresh), so two can reach this point before either has
  // committed. Let the unique index arbitrate and re-read the winner
  // rather than trying to pre-check our way out of the race.
  try {
    const created = await db.user.create({
      data: { privyDid: did, email, walletAddress },
    });
    return toSession(created);
  } catch {
    const winner = await db.user.findUnique({ where: { privyDid: did } });
    return winner ? toSession(winner) : null;
  }
}

function toSession(u: {
  id: string;
  privyDid: string;
  email: string;
  name: string | null;
  walletAddress: string | null;
}): SessionUser {
  return {
    id: u.id,
    privyDid: u.privyDid,
    email: u.email,
    name: u.name,
    walletAddress: u.walletAddress,
  };
}
