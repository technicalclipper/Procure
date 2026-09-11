import type { RenderedEmail } from "./templates";
import type { Check } from "../procurement/three-way";

/**
 * The match verdict.
 *
 * Every check is listed, passed ones included. A mail that shows only
 * what went wrong tells you nothing about what was actually examined,
 * and the whole value of a three-way match is knowing that all three
 * legs were compared rather than assuming it.
 */

export type MatchResultEmailInput = {
  billNumber: string;
  poNumber: string;
  orgName: string;
  vendorName: string;
  recipientEmail: string;
  passed: boolean;
  checks: Check[];
  orderedAmount: string;
  invoicedAmount: string;
  variance: string;
  billUrl: string;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMatchResultEmail(
  input: MatchResultEmailInput,
): RenderedEmail {
  const tone = input.passed ? "#047857" : "#b91c1c";
  const failed = input.checks.filter((c) => !c.passed);

  const subject = input.passed
    ? `${input.billNumber} matched — ${input.poNumber} is payable`
    : `${input.billNumber} failed the three-way match`;

  const rows = input.checks
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;width:22px;font-size:14px;color:${c.passed ? "#047857" : "#b91c1c"};">
          ${c.passed ? "&#10003;" : "&#10007;"}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:13px;color:${c.passed ? "#0f172a" : "#b91c1c"};font-weight:${c.passed ? "400" : "600"};">${esc(c.label)}</div>
          <div style="font-size:12px;color:#64748b;line-height:1.5;">${esc(c.detail)}</div>
        </td>
      </tr>`,
    )
    .join("");

  const verdict = input.passed
    ? `All three legs agree. Payment releases against this bill — there is
       no further decision to make.`
    : `Payment is blocked. ${
        failed.length === 1 ? "One check failed" : `${failed.length} checks failed`
      }, and nothing can be paid against this bill until it passes.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${tone};">
        Three-way match ${input.passed ? "passed" : "failed"}
      </div>

      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;">
        ${esc(input.billNumber)}
      </h1>

      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#475569;">
        ${esc(input.vendorName)} against
        <span style="font-family:ui-monospace,monospace;color:#0f172a;">${esc(input.poNumber)}</span>.
        Ordered <strong style="color:#0f172a;">${esc(input.orderedAmount)}</strong>,
        invoiced <strong style="color:#0f172a;">${esc(input.invoicedAmount)}</strong>
        (${esc(input.variance)}).
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
        <tr><td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>

      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${input.passed ? "#475569" : "#b91c1c"};">
        ${verdict}
      </p>

      <div style="margin:22px 0 0;">
        <a href="${esc(input.billUrl)}"
           style="display:inline-block;padding:11px 20px;border-radius:6px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open ${esc(input.billNumber)}
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
    `${input.vendorName} against ${input.poNumber}.`,
    `Ordered ${input.orderedAmount}, invoiced ${input.invoicedAmount} (${input.variance}).`,
    ``,
    ...input.checks.map(
      (c) => `  [${c.passed ? "x" : " "}] ${c.label}\n        ${c.detail}`,
    ),
    ``,
    verdict.replace(/\s+/g, " ").trim(),
    ``,
    `Open ${input.billNumber}: ${input.billUrl}`,
  ].join("\n");

  return { subject, html, text };
}
