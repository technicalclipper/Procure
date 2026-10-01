/**
 * A small PDF writer.
 *
 * Written by hand rather than pulled in, because these documents are
 * text, rules and tables — and every library that does that also does
 * font embedding, image decoding and bundler configuration we'd have to
 * fight in a Next server route. The base-14 fonts (Helvetica and its
 * bold) are required to be present in every PDF reader, so nothing has
 * to be embedded and the output is a few kilobytes.
 *
 * PDF coordinates start at the bottom-left, which is upside down from
 * how anyone lays out a document. `Doc` tracks a downward cursor and
 * converts, so callers think in "distance from the top" throughout.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;

type Font = "Helvetica" | "Helvetica-Bold";

/** Widths for the base-14 metrics, per 1000 units of font size. */
const WIDTHS: Record<Font, Record<string, number>> = {
  Helvetica: {},
  "Helvetica-Bold": {},
};

// Helvetica advance widths (AFM), indexed by char code 32..126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];
for (let i = 0; i < HELV.length; i++) {
  WIDTHS.Helvetica[String.fromCharCode(32 + i)] = HELV[i];
  WIDTHS["Helvetica-Bold"][String.fromCharCode(32 + i)] = HELV_BOLD[i];
}

export function textWidth(s: string, size: number, font: Font = "Helvetica") {
  let w = 0;
  for (const ch of s) w += WIDTHS[font][ch] ?? 556;
  return (w * size) / 1000;
}

/** PDF strings escape backslash and both parens. */
function esc(s: string) {
  return s.replace(/[\\()]/g, (c) => "\\" + c);
}

/** Latin-1 is what the base-14 fonts cover; anything else becomes "?". */
function latin1(s: string) {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\xFF]/g, "?");
}

export class Doc {
  private ops: string[] = [];
  private pages: string[] = [];
  /** Distance from the top of the page. */
  y = MARGIN;

  readonly width = A4.width;
  readonly left = MARGIN;
  readonly right = A4.width - MARGIN;
  readonly contentWidth = A4.width - MARGIN * 2;

  private toPdfY(yFromTop: number) {
    return A4.height - yFromTop;
  }

  /** Start a new page if the next block wouldn't fit. */
  ensure(space: number) {
    if (this.y + space > A4.height - MARGIN) this.newPage();
  }

  newPage() {
    this.pages.push(this.ops.join("\n"));
    this.ops = [];
    this.y = MARGIN;
  }

  text(
    s: string,
    opts: {
      x?: number;
      size?: number;
      font?: Font;
      color?: [number, number, number];
      align?: "left" | "right" | "center";
      width?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font ?? "Helvetica";
    const [r, g, b] = opts.color ?? [0.06, 0.09, 0.16];
    const body = latin1(s);

    let x = opts.x ?? this.left;
    if (opts.align === "right") {
      x = (opts.x ?? this.right) - textWidth(body, size, font);
    } else if (opts.align === "center") {
      const w = opts.width ?? this.contentWidth;
      x = (opts.x ?? this.left) + (w - textWidth(body, size, font)) / 2;
    }

    this.ops.push(
      `BT /${font === "Helvetica-Bold" ? "F2" : "F1"} ${size} Tf ${r} ${g} ${b} rg ` +
        `1 0 0 1 ${x.toFixed(2)} ${this.toPdfY(this.y + size).toFixed(2)} Tm ` +
        `(${esc(body)}) Tj ET`,
    );
    return this;
  }

  /** Text, then advance the cursor past it. */
  line(
    s: string,
    opts: Parameters<Doc["text"]>[1] & { leading?: number } = {},
  ) {
    const size = opts.size ?? 10;
    this.text(s, opts);
    this.y += opts.leading ?? size * 1.45;
    return this;
  }

  /** Wrap to the content width, returning how many lines were drawn. */
  paragraph(
    s: string,
    opts: Parameters<Doc["text"]>[1] & { leading?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font ?? "Helvetica";
    const max = opts.width ?? this.contentWidth;
    const words = latin1(s).split(/\s+/);
    let current = "";
    let drawn = 0;

    for (const w of words) {
      const attempt = current ? `${current} ${w}` : w;
      if (textWidth(attempt, size, font) > max && current) {
        this.line(current, opts);
        drawn++;
        current = w;
      } else {
        current = attempt;
      }
    }
    if (current) {
      this.line(current, opts);
      drawn++;
    }
    return drawn;
  }

  rule(opts: { color?: [number, number, number]; width?: number } = {}) {
    const [r, g, b] = opts.color ?? [0.89, 0.91, 0.94];
    const yy = this.toPdfY(this.y).toFixed(2);
    this.ops.push(
      `${r} ${g} ${b} RG ${opts.width ?? 0.7} w ${this.left} ${yy} m ${this.right} ${yy} l S`,
    );
    this.y += 1;
    return this;
  }

  box(
    height: number,
    opts: { fill?: [number, number, number]; x?: number; width?: number } = {},
  ) {
    const [r, g, b] = opts.fill ?? [0.97, 0.98, 0.99];
    const x = opts.x ?? this.left;
    const w = opts.width ?? this.contentWidth;
    this.ops.push(
      `${r} ${g} ${b} rg ${x} ${this.toPdfY(this.y + height).toFixed(2)} ${w} ${height} re f`,
    );
    return this;
  }

  gap(n: number) {
    this.y += n;
    return this;
  }

  /** Serialise. Objects are written in order and offsets recorded for xref. */
  build(): Uint8Array {
    this.pages.push(this.ops.join("\n"));
    const pageCount = this.pages.length;

    const objects: string[] = [];
    const pageIds: number[] = [];
    // 1 catalog, 2 pages, 3 F1, 4 F2, then (content, page) per page
    for (let i = 0; i < pageCount; i++) pageIds.push(5 + i * 2 + 1);

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(
      `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );

    for (let i = 0; i < pageCount; i++) {
      const content = this.pages[i];
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      );
    }

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    // Latin-1, not UTF-8 — byte offsets in the xref must match the bytes
    // on disk, and a multi-byte encoding would shift every one of them.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

export function pdfResponse(doc: Doc, filename: string) {
  const bytes = doc.build();
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
