import type { RenderedEmail } from "./templates";

/**
 * The vendor answering a purchase order.
 *
 * The buyer has budget committed against this order from the moment it
 * was issued. An acceptance frees them to expect delivery; a rejection
 * means that commitment is sitting there for nothing — so the reason
 * travels with the mail rather than waiting to be discovered in the app.
 */

export type VendorResponseEmailInput = {
  poNumber: string;
  orgName: string;
  vendorName: string;
  recipientEmail: string;
  amount: string;
  accepted: boolean;
  reason?: string | null;
  orderUrl: string;
};

const ACCENT = "#4f46e5";
const GOOD = "#047857";
const BAD = "#b91c1c";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderVendorResponseEmail(
  input: VendorResponseEmailInput,
): RenderedEmail {
  const verb = input.accepted ? "accepted" : "rejected";
  const tone = input.accepted ? GOOD : BAD;
  const subject = `${input.poNumber} ${verb} by ${input.vendorName}`;

  const note = input.reason
    ? `<div style="margin:16px 0 0;padding:12px 14px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;">
         <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">From ${esc(input.vendorName)}</div>
         ${esc(input.reason)}
       </div>`
    : "";

  const followUp = input.accepted
    ? `Confirm receipt once the goods or services arrive. The invoice the
       vendor submits will be matched against this order and that receipt
       before anything can be paid.`
    : `The budget committed by this order is still held against it. Cancel
       the order to release it, or work the issue out with the vendor and
       re-issue.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${tone};">
        Order ${esc(verb)}
      </div>

      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;">
        ${esc(input.poNumber)}
      </h1>

      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        <strong style="color:#0f172a;">${esc(input.vendorName)}</strong> has
        ${esc(verb)} your purchase order for
        <strong style="color:#0f172a;font-variant-numeric:tabular-nums;">${esc(input.amount)}</strong>.
      </p>

      ${note}

      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;">
        ${followUp}
      </p>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.orderUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open ${esc(input.poNumber)}
        </a>
      </div>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        Sent to ${esc(input.recipientEmail)} because you are on ${esc(input.orgName)} in Procure.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    ``,
    `${input.vendorName} has ${verb} your purchase order for ${input.amount}.`,
    ...(input.reason ? [``, `From ${input.vendorName}: ${input.reason}`] : []),
    ``,
    followUp.replace(/\s+/g, " ").trim(),
    ``,
    `Open ${input.poNumber}: ${input.orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export type OrderMessageEmailInput = {
  poNumber: string;
  fromName: string;
  recipientEmail: string;
  body: string;
  orderUrl: string;
};

export function renderOrderMessageEmail(
  input: OrderMessageEmailInput,
): RenderedEmail {
  const subject = `New message on ${input.poNumber}`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">Message</div>

      <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;color:#0f172a;font-weight:600;">
        ${esc(input.fromName)} wrote on
        <span style="font-family:ui-monospace,monospace;">${esc(input.poNumber)}</span>
      </h1>

      <div style="margin:16px 0 0;padding:12px 14px;border-radius:6px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;white-space:pre-wrap;">${esc(input.body)}</div>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.orderUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Reply on the order
        </a>
      </div>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        Sent to ${esc(input.recipientEmail)} via Procure. Messages on an order
        are visible to both sides.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    ``,
    `${input.fromName} wrote on ${input.poNumber}:`,
    ``,
    input.body,
    ``,
    `Reply: ${input.orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
