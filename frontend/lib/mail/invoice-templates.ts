import type { RenderedEmail } from "./templates";

/**
 * The vendor's invoice arriving.
 *
 * The variance is stated up front, because that single number decides
 * everything downstream: inside tolerance and the bill matches and pays
 * itself, outside and it stops dead for a human. Burying it under a
 * "new invoice received" headline would hide the only fact that matters.
 */

export type InvoiceSubmittedEmailInput = {
  vendorInvoiceNumber: string;
  poNumber: string;
  grnNumber: string;
  orgName: string;
  vendorName: string;
  recipientEmail: string;
  orderedAmount: string;
  invoicedAmount: string;
  /// Signed difference, already formatted — "+$120.00" / "$0.00"
  variance: string;
  withinTolerance: boolean;
  tolerancePercent: string;
  note?: string | null;
  orderUrl: string;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderInvoiceSubmittedEmail(
  input: InvoiceSubmittedEmailInput,
): RenderedEmail {
  const ok = input.withinTolerance;
  const tone = ok ? "#047857" : "#b91c1c";

  const subject = ok
    ? `${input.poNumber} — invoice ${input.vendorInvoiceNumber} matches`
    : `${input.poNumber} — invoice ${input.vendorInvoiceNumber} is off by ${input.variance}`;

  const verdict = ok
    ? `The order, the receipt and this invoice agree within the
       ${esc(input.tolerancePercent)} tolerance. Nothing needs a decision —
       raising the bill will match and release payment.`
    : `This invoice does not agree with what was ordered. It is outside the
       ${esc(input.tolerancePercent)} tolerance, so the match will fail and
       no payment can be released until it is resolved with
       ${esc(input.vendorName)}.`;

  const note = input.note
    ? `<div style="margin:16px 0 0;padding:12px 14px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;">
         <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">From ${esc(input.vendorName)}</div>
         ${esc(input.note)}
       </div>`
    : "";

  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#64748b;">${esc(label)}</td>
      <td style="padding:6px 0;font-size:${strong ? "15px" : "13px"};font-weight:${strong ? "600" : "400"};color:${strong ? tone : "#0f172a"};text-align:right;font-variant-numeric:tabular-nums;">${esc(value)}</td>
    </tr>`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${tone};">
        ${ok ? "Invoice matches" : "Invoice does not match"}
      </div>

      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;">
        ${esc(input.vendorInvoiceNumber)}
      </h1>

      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        <strong style="color:#0f172a;">${esc(input.vendorName)}</strong> has invoiced
        against <span style="font-family:ui-monospace,monospace;color:#0f172a;">${esc(input.poNumber)}</span>,
        received as <span style="font-family:ui-monospace,monospace;color:#0f172a;">${esc(input.grnNumber)}</span>.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
        <tr><td style="padding:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row("Ordered", input.orderedAmount)}
            ${row("Invoiced", input.invoicedAmount)}
            <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #e2e8f0;"></td></tr>
            ${row("Variance", input.variance, true)}
          </table>
        </td></tr>
      </table>

      ${note}

      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;">${verdict}</p>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.orderUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
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
    `${input.vendorName} has invoiced against ${input.poNumber}, received as ${input.grnNumber}.`,
    ``,
    `  Ordered:  ${input.orderedAmount}`,
    `  Invoiced: ${input.invoicedAmount}`,
    `  Variance: ${input.variance}`,
    ...(input.note ? [``, `From ${input.vendorName}: ${input.note}`] : []),
    ``,
    verdict.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    ``,
    `Open ${input.poNumber}: ${input.orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
