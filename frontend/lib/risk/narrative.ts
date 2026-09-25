import type { ScreeningResult } from "./signals";

/**
 * AI writes the assessment. It does not do the detection.
 *
 * Every number it sees was computed deterministically from indexed
 * transfer data — the model's job is to turn those signals into
 * something a procurement person can act on, and to say plainly when the
 * evidence is thin. If the model were deciding, the score would be
 * unauditable and we could not show a judge where a verdict came from.
 */

function clean(s: string | undefined) {
  return (s ?? "").replace(/[^\x20-\x7e]/g, "").trim();
}

const SYSTEM = `You assess whether a crypto payout address behaves like a legitimate operating business, for a procurement team about to add it as a payable vendor.

You are given signals computed from indexed onchain transfer data. Write 2-3 sentences of plain English for a finance professional who does not read block explorers.

Rules:
- Interpret the signals given. Never invent facts, counts, dates or amounts.
- Lead with what matters most to the decision.
- Behavioural evidence only. You cannot verify identity or ownership; never imply you can.
- If evidence is thin, say so — "little evidence either way" is a valid and useful assessment.
- No hedging boilerplate, no bullet points, no headings. Plain prose.
- Do not restate the score or the band; the reader can see them.`;

export async function writeNarrative(
  result: ScreeningResult,
  vendorName: string,
): Promise<{ text: string; model: string | null; error?: string }> {
  const key = clean(process.env.OPENAI_API_KEY);
  const model = clean(process.env.AI_MODEL) || "gpt-4o";

  const facts = {
    vendor: vendorName,
    address: result.address,
    score: result.score,
    band: result.band,
    ageDays: result.stats.ageDays,
    firstActivity: result.stats.firstActivity,
    commercialInbound: result.stats.inboundCount,
    commercialOutbound: result.stats.outboundCount,
    dustTransfersExcluded: result.stats.dustCount,
    distinctPayers: result.stats.distinctPayers,
    forwardedWithin25Blocks: result.stats.sweepRatio,
    accountType: result.stats.accountType,
    chainsWithActivity: result.stats.networksWithActivity,
    stablecoinBalancesHeld: result.stats.balanceCount,
    signals: result.signals.map((s) => ({
      signal: s.label,
      finding: s.finding,
      scoreContribution: s.delta,
    })),
  };

  if (!key) {
    return {
      text: fallback(result),
      model: null,
      error: "OPENAI_API_KEY not set — showing a rule-based summary.",
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Signals for this payout address:\n\n${JSON.stringify(facts, null, 2)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        text: fallback(result),
        model: null,
        error: `OpenAI ${res.status}: ${body.slice(0, 120)}`,
      };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { text: fallback(result), model: null, error: "Empty response." };
    }
    return { text, model };
  } catch (e) {
    return {
      text: fallback(result),
      model: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Rule-based summary when the model is unavailable.
 *
 * The screen must still produce a usable assessment without OpenAI —
 * the decision belongs to the signals, and the narrative is presentation.
 */
function fallback(r: ScreeningResult): string {
  const bad = r.signals.filter((s) => s.delta <= -10);
  const lead =
    bad.length > 0
      ? bad.map((s) => s.finding).join(" ")
      : "No signal indicates elevated risk on the evidence available.";

  const context =
    r.stats.ageDays === null
      ? "There is no transfer history to judge against."
      : `The address has been active for ${Math.floor(r.stats.ageDays / 30)} months and shows ${r.stats.inboundCount} commercial-sized inbound transfers.`;

  return `${lead} ${context}`;
}
