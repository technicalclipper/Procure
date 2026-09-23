import { db } from "../db";
import type { RenderedEmail } from "./templates";

/**
 * Mailer.
 *
 * Every send is recorded in the Notification table whether or not a
 * provider is configured. Two reasons:
 *
 *  1. The outbox panel is what we demo — a failed SMTP call must never be
 *     the reason the event chain looks empty.
 *  2. The whole notification layer is buildable and testable before any
 *     API key exists. MAIL_ENABLED=false runs the no-op path.
 *
 * Sending is deliberately fire-and-forget from the caller's perspective:
 * a workflow transition must not roll back because an email bounced.
 */

export type SendInput = {
  /** Workflow event name, e.g. "INVITATION_SENT" */
  event: string;
  recipient: string;
  template: string;
  email: RenderedEmail;
};

export type SendResult = {
  recorded: boolean;
  sent: boolean;
  providerId?: string;
  error?: string;
};

function clean(s: string | undefined) {
  return (s ?? "").replace(/[^\x20-\x7e]/g, "").trim();
}

async function sendViaResend(
  to: string,
  email: RenderedEmail,
): Promise<{ providerId?: string; error?: string }> {
  const key = clean(process.env.RESEND_API_KEY);
  const from = clean(process.env.MAIL_FROM) || "onboarding@resend.dev";
  if (!key) return { error: "RESEND_API_KEY not set" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return { error: body.message ?? body.name ?? `HTTP ${res.status}` };
    }
    return { providerId: body.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const enabled = clean(process.env.MAIL_ENABLED).toLowerCase() === "true";

  let providerId: string | undefined;
  let error: string | undefined;
  let sent = false;

  if (enabled) {
    const out = await sendViaResend(input.recipient, input.email);
    providerId = out.providerId;
    error = out.error;
    sent = !out.error;
  } else {
    error = undefined;
  }

  try {
    // The unique index is (event, recipient, template), so re-running a
    // transition updates the existing row rather than spamming the outbox.
    await db.notification.upsert({
      where: {
        event_recipient_template: {
          event: input.event,
          recipient: input.recipient,
          template: input.template,
        },
      },
      update: {
        subject: input.email.subject,
        body: input.email.html,
        sentAt: sent ? new Date() : null,
        providerId,
        error,
      },
      create: {
        event: input.event,
        recipient: input.recipient,
        template: input.template,
        subject: input.email.subject,
        body: input.email.html,
        sentAt: sent ? new Date() : null,
        providerId,
        error,
      },
    });
    return { recorded: true, sent, providerId, error };
  } catch (e) {
    return {
      recorded: false,
      sent,
      providerId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
