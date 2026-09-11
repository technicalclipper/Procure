import type { RenderedEmail } from "./templates";

/**
 * Delivery confirmed.
 *
 * For the vendor this is the signal to invoice — under a three-way match
 * an invoice raised before receipt has nothing to match against and will
 * simply sit. Telling them the moment the goods are booked in is what
 * stops that from being a mystery.
 */

export type GoodsReceiptEmailInput = {
  grnNumber: string;
  poNumber: string;
  orgName: string;
  recipientEmail: string;
  receivedBy: string;
  amount: string;
  note?: string | null;
  portalUrl: string;
  /// Vendors are asked to invoice; the buying side is only informed.
  audience: "vendor" | "buyer";
};

const ACCENT = "#047857";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderGoodsReceiptEmail(
  input: GoodsReceiptEmailInput,
): RenderedEmail {
  const forVendor = input.audience === "vendor";

  const subject = forVendor
    ? `${input.poNumber} received — you can now invoice`
    : `${input.poNumber} received — ${input.grnNumber}`;

  const lead = forVendor
    ? `<strong style="color:#0f172a;">${esc(input.orgName)}</strong> has confirmed
       delivery against <strong style="color:#0f172a;font-family:ui-monospace,monospace;">${esc(input.poNumber)}</strong>.
       You can now submit your invoice.`
    : `<strong style="color:#0f172a;">${esc(input.receivedBy)}</strong> confirmed
       delivery against <strong style="color:#0f172a;font-family:ui-monospace,monospace;">${esc(input.poNumber)}</strong>.`;

  const explain = forVendor
    ? `Your invoice is checked against this order and this receipt before
       payment is released. As long as all three agree within the agreed
       tolerance, settlement is automatic — there is nobody to chase.`
    : `Two of the three legs are now in place. When the vendor invoices,
       the order, this receipt and that invoice are compared, and payment
       releases only if they agree.`;

  const cta = forVendor ? "Submit your invoice" : "Open the order";

  const note = input.note
    ? `<div style="margin:16px 0 0;padding:12px 14px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;">
         <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Note on receipt</div>
         ${esc(input.note)}
       </div>`
    : "";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">Goods received</div>

      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;">
        ${esc(input.grnNumber)}
      </h1>

      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#475569;">${lead}</p>

      <div style="margin:18px 0 0;padding:14px 16px;border-radius:8px;background:#ffffff;border:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;">Order value</div>
        <div style="margin-top:2px;font-size:20px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">${esc(input.amount)}</div>
      </div>

      ${note}

      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;">${explain}</p>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.portalUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          ${esc(cta)}
        </a>
      </div>

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8;">
        Sent to ${esc(input.recipientEmail)} by ${esc(input.orgName)} via Procure.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    ``,
    forVendor
      ? `${input.orgName} has confirmed delivery against ${input.poNumber}. You can now submit your invoice.`
      : `${input.receivedBy} confirmed delivery against ${input.poNumber}.`,
    ``,
    `  Receipt: ${input.grnNumber}`,
    `  Order value: ${input.amount}`,
    ...(input.note ? [`  Note: ${input.note}`] : []),
    ``,
    explain.replace(/\s+/g, " ").trim(),
    ``,
    `${cta}: ${input.portalUrl}`,
  ].join("\n");

  return { subject, html, text };
}
