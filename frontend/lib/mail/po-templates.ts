import type { RenderedEmail } from "./templates";

/**
 * The purchase order itself.
 *
 * This is a document the vendor acts on, not a notification that
 * something happened — it carries what was ordered, what it is worth and
 * the terms, so it stands alone in an inbox.
 */

export type PurchaseOrderEmailInput = {
  poNumber: string;
  orgName: string;
  vendorName: string;
  recipientEmail: string;
  amount: string;
  paymentTerms: string;
  lines: { description: string; quantity: number; amount: string }[];
  portalUrl: string;
};

const BRAND = "#4f46e5";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPurchaseOrderEmail(
  input: PurchaseOrderEmailInput,
): RenderedEmail {
  const subject = `${input.poNumber} — purchase order from ${input.orgName}`;

  const rows = input.lines
    .map(
      (l) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">
            ${esc(l.description)}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right;">
            ${l.quantity}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;text-align:right;font-variant-numeric:tabular-nums;">
            ${esc(l.amount)}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">Purchase order</div>

      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;">
        ${esc(input.poNumber)}
      </h1>

      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        <strong style="color:#0f172a;">${esc(input.orgName)}</strong> has issued a
        purchase order to <strong style="color:#0f172a;">${esc(input.vendorName)}</strong>.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
        <tr><td style="padding:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <th style="text-align:left;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Description</th>
              <th style="text-align:right;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Qty</th>
              <th style="text-align:right;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Amount</th>
            </tr>
            ${rows}
            <tr>
              <td style="padding:10px 0 0;font-size:13px;font-weight:600;color:#0f172a;" colspan="2">Total</td>
              <td style="padding:10px 0 0;font-size:15px;font-weight:600;color:#0f172a;text-align:right;font-variant-numeric:tabular-nums;">
                ${esc(input.amount)}
              </td>
            </tr>
          </table>

          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            Payment terms: <strong style="color:#0f172a;">${esc(input.paymentTerms)}</strong>.
            Settled in USDC to your registered payout address.
          </div>
        </td></tr>
      </table>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.portalUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:${BRAND};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Review and accept
        </a>
      </div>

      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
        Accept it to confirm you can supply, or reject it with a reason.
        Once you have delivered, submit your invoice against this order in
        the portal.
      </p>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        Sent to ${esc(input.recipientEmail)} by ${esc(input.orgName)} via Procure.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.poNumber} — purchase order from ${input.orgName}`,
    ``,
    `${input.orgName} has issued a purchase order to ${input.vendorName}.`,
    ``,
    ...input.lines.map(
      (l) => `  ${l.description}  x${l.quantity}  ${l.amount}`,
    ),
    ``,
    `  Total: ${input.amount}`,
    `  Payment terms: ${input.paymentTerms}, settled in USDC to your payout address.`,
    ``,
    `Review and accept: ${input.portalUrl}`,
    ``,
    `Accept to confirm you can supply, or reject with a reason. Once delivered, submit your invoice against this order in the portal.`,
  ].join("\n");

  return { subject, html, text };
}
