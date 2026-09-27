import type { RenderedEmail } from "./templates";

/**
 * Vendor portal invitation.
 *
 * Kept separate from the org invitation template because the audience is
 * different: this goes to someone outside the organisation who is being
 * given a window onto their own orders, not a seat inside the buyer's
 * system. The copy has to explain what they will and will not see.
 */

export type VendorInviteInput = {
  vendorName: string;
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  recipientEmail: string;
  acceptUrl: string;
};

const BRAND = "#4f46e5";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderVendorPortalInvite(
  input: VendorInviteInput,
): RenderedEmail {
  const subject = `${input.orgName} invited you to the Procure vendor portal`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">Procure · Vendor portal</div>

      <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:600;">
        ${esc(input.orgName)} wants to send you purchase orders
      </h1>

      <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        ${esc(input.inviterName)} at <strong style="color:#0f172a;">${esc(input.orgName)}</strong>
        has set up <strong style="color:#0f172a;">${esc(input.vendorName)}</strong> as a supplier and
        invited you to their vendor portal.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
        <tr><td style="padding:16px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;">In the portal you can</div>
          <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.7;color:#475569;">
            <li>See purchase orders sent to you</li>
            <li>Accept, reject or comment on them</li>
            <li>Submit an invoice against an accepted order</li>
            <li>Track payment and download the remittance advice</li>
          </ul>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
            You will not see their budgets, other suppliers, or anything
            internal — only what concerns your own orders.
          </div>
        </td></tr>
      </table>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.acceptUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:${BRAND};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open the vendor portal
        </a>
      </div>

      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
        Sign in with <strong>${esc(input.recipientEmail)}</strong> — the address this
        was sent to. A wallet is created for you automatically, with no seed
        phrase or extension, and it is where payments will arrive.
      </p>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        Questions about this invitation? Reply to ${esc(input.inviterEmail)}.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.orgName} wants to send you purchase orders`,
    ``,
    `${input.inviterName} at ${input.orgName} has set up ${input.vendorName} as a supplier and invited you to their vendor portal.`,
    ``,
    `In the portal you can:`,
    `  - See purchase orders sent to you`,
    `  - Accept, reject or comment on them`,
    `  - Submit an invoice against an accepted order`,
    `  - Track payment and download the remittance advice`,
    ``,
    `You will not see their budgets, other suppliers, or anything internal.`,
    ``,
    `Open the portal: ${input.acceptUrl}`,
    ``,
    `Sign in with ${input.recipientEmail}. A wallet is created for you automatically, and it is where payments will arrive.`,
    ``,
    `Questions? Reply to ${input.inviterEmail}.`,
  ].join("\n");

  return { subject, html, text };
}
