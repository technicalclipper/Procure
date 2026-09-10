/**
 * Email templates.
 *
 * Pure — no database, no server imports — so the invite form can render
 * the exact same output as a live preview. If the preview and the send
 * used different code they would drift, and the preview would be a lie.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type InvitationEmailInput = {
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  recipientEmail: string;
  /** OWNER | CONTROLLER | MEMBER */
  orgRole: string;
  /** REQUESTER | APPROVER, when a department role is granted too */
  deptRole?: string | null;
  departmentName?: string | null;
  acceptUrl: string;
  expiresAt: Date;
};

const BRAND = "#4f46e5";

export function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** One-line description of what the invitee will be able to do. */
export function describeRole(
  orgRole: string,
  deptRole?: string | null,
  departmentName?: string | null,
): string {
  const org =
    orgRole === "OWNER"
      ? "Owner — full control of the organisation"
      : orgRole === "CONTROLLER"
        ? "Controller — manages departments, budgets, master data and vendors"
        : "Member";

  if (!deptRole || !departmentName) return org;

  const dept =
    deptRole === "APPROVER"
      ? `Approver in ${departmentName} — signs off on purchase requests and counts toward quorum`
      : deptRole === "PURCHASER"
        ? `Purchaser in ${departmentName} — turns approved requests into purchase orders, and handles vendors, items and bills`
        : `Requester in ${departmentName} — raises purchase requests and confirms goods receipt`;

  return orgRole === "MEMBER" ? dept : `${org}. Also ${dept}`;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function renderInvitationEmail(
  input: InvitationEmailInput,
): RenderedEmail {
  const roleLine = describeRole(
    input.orgRole,
    input.deptRole,
    input.departmentName,
  );
  const subject = `${input.inviterName} invited you to ${input.orgName} on Procure`;

  const badge = input.departmentName
    ? `${titleCase(input.deptRole ?? "")} · ${input.departmentName}`
    : titleCase(input.orgRole);

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">Procure</div>

      <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:600;">
        You've been invited to ${esc(input.orgName)}
      </h1>

      <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        ${esc(input.inviterName)} (${esc(input.inviterEmail)}) has invited you to join
        <strong style="color:#0f172a;">${esc(input.orgName)}</strong> on Procure —
        procure-to-pay for onchain companies.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
        <tr><td style="padding:16px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;">Your role</div>
          <div style="margin-top:6px;display:inline-block;padding:3px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;">
            ${esc(badge)}
          </div>
          <div style="margin-top:10px;font-size:13px;line-height:1.55;color:#475569;">${esc(roleLine)}</div>
        </td></tr>
      </table>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.acceptUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:${BRAND};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Accept invitation
        </a>
      </div>

      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
        Sign in with <strong>${esc(input.recipientEmail)}</strong> — a wallet is created for you
        automatically, with no seed phrase or extension. This invitation expires on
        ${formatDate(input.expiresAt)}.
      </p>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        If you weren't expecting this, you can ignore it — nothing happens until you accept.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `You've been invited to ${input.orgName}`,
    ``,
    `${input.inviterName} (${input.inviterEmail}) has invited you to join ${input.orgName} on Procure.`,
    ``,
    `Your role: ${badge}`,
    roleLine,
    ``,
    `Accept: ${input.acceptUrl}`,
    ``,
    `Sign in with ${input.recipientEmail}. A wallet is created for you automatically.`,
    `This invitation expires on ${formatDate(input.expiresAt)}.`,
    ``,
    `If you weren't expecting this, you can ignore it — nothing happens until you accept.`,
  ].join("\n");

  return { subject, html, text };
}
