/**
 * VoxPrep thesis: Markdown -> DOCX
 *
 * Builds a single submittable Word document from docs/thesis/*.md with
 * thesis-conventional formatting: Times New Roman 12, 1.5 line spacing,
 * bound-edge margin, roman-numbered front matter, arabic-numbered body,
 * a live table-of-contents field, and rendered Mermaid figures where
 * available.
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageNumber, Footer, Header, TableOfContents, ImageRun, PageBreak,
  LevelFormat, convertInchesToTwip, ExternalHyperlink, TabStopType,
} from 'docx';

const THESIS_DIR = process.argv[2] || 'D:/VoxPrep/docs/thesis';
const DIAGRAM_DIR = process.argv[3] || './diagrams';
const OUT = process.argv[4] || './VoxPrep-Thesis.docx';

const FONT = 'Times New Roman';
const MONO = 'Consolas';
const BODY_PT = 12;
const half = (pt) => pt * 2;               // docx sizes are half-points
const LINE_15 = 360;                       // 1.5 line spacing (240 = single)

const ORDER = [
  '00-front-matter.md', '01-introduction.md', '02-literature-review.md',
  '03-methodology.md', '04-implementation.md', '05-testing-and-evaluation.md',
  '06-conclusion.md', 'references.md', 'appendices.md',
];

// ── Figure registry ────────────────────────────────────────────────────────
// Diagrams are rendered separately (render-diagrams.mjs). Each mermaid block is
// matched to its PNG by document order.
let figIndex = 0;
const figures = [];
function nextFigure() {
  const p = path.join(DIAGRAM_DIR, `fig-${String(figIndex).padStart(2, '0')}.png`);
  figIndex += 1;
  return fs.existsSync(p) ? p : null;
}

/** PNG intrinsic size, straight from the IHDR chunk. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const MAX_W = 600;   // px at 96dpi ≈ 6.25in, fits A4 with the margins below
const MAX_H = 780;

// ── Inline formatting ──────────────────────────────────────────────────────
function runs(tokens, inherit = {}) {
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case 'text':
        if (t.tokens?.length) out.push(...runs(t.tokens, inherit));
        else out.push(new TextRun({ text: decode(t.text), ...inherit, font: FONT, size: half(BODY_PT) }));
        break;
      case 'strong':
        out.push(...runs(t.tokens, { ...inherit, bold: true }));
        break;
      case 'em':
        out.push(...runs(t.tokens, { ...inherit, italics: true }));
        break;
      case 'del':
        out.push(...runs(t.tokens, { ...inherit, strike: true }));
        break;
      case 'codespan':
        out.push(new TextRun({
          text: decode(t.text), font: MONO, size: half(BODY_PT - 1.5),
          color: '9C1D3D', ...inherit,
        }));
        break;
      case 'link': {
        const inner = runs(t.tokens, { ...inherit, color: '1155CC', underline: {} });
        // Internal chapter links become plain text: they mean nothing on paper.
        if (/^https?:/i.test(t.href)) {
          out.push(new ExternalHyperlink({ children: inner, link: t.href }));
        } else {
          out.push(...runs(t.tokens, inherit));
        }
        break;
      }
      case 'br':
        out.push(new TextRun({ break: 1 }));
        break;
      case 'escape':
        out.push(new TextRun({ text: decode(t.text), ...inherit, font: FONT, size: half(BODY_PT) }));
        break;
      case 'html':
        break; // drop stray tags
      default:
        if (t.tokens?.length) out.push(...runs(t.tokens, inherit));
        else if (t.text) out.push(new TextRun({ text: decode(t.text), ...inherit, font: FONT, size: half(BODY_PT) }));
    }
  }
  return out;
}

function decode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    // The source is hard-wrapped for readable diffs; Word must reflow it.
    .replace(/\s*\n\s*/g, ' ');
}

const para = (children, opts = {}) => new Paragraph({
  children, spacing: { line: LINE_15, after: 160 }, alignment: AlignmentType.JUSTIFIED, ...opts,
});

const text = (s, opts = {}) => new TextRun({ text: s, font: FONT, size: half(BODY_PT), ...opts });

// ── Block conversion ───────────────────────────────────────────────────────
function convertTokens(tokens, ctx) {
  const out = [];
  for (const t of tokens) out.push(...convertToken(t, ctx));
  return out;
}

function convertToken(t, ctx) {
  switch (t.type) {
    case 'heading':      return heading(t, ctx);
    case 'paragraph':    return [para(runs(t.tokens))];
    case 'blockquote':   return blockquote(t, ctx);
    case 'list':         return list(t, ctx);
    case 'table':        return [table(t), spacer()];
    case 'code':         return code(t);
    case 'hr':           return [];             // section rules; page breaks carry the job
    case 'space':        return [];
    case 'html':         return [];
    default:             return t.tokens ? convertTokens(t.tokens, ctx) : [];
  }
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 200 } });

function heading(t, ctx) {
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const isChapter = t.depth === 1;
  return [new Paragraph({
    children: runs(t.tokens, { bold: true }),
    heading: levels[t.depth - 1],
    pageBreakBefore: isChapter && !ctx.firstHeadingUsed,
    spacing: { before: isChapter ? 0 : 320, after: isChapter ? 320 : 160, line: 276 },
    alignment: AlignmentType.LEFT,
    keepNext: true,
  })];
}

/**
 * Author guidance blocks — kept, but unmistakably flagged so they can be found
 * and deleted before submission. Built directly from the inner tokens: a
 * Paragraph is opaque once constructed, so its runs cannot be re-wrapped after
 * the fact.
 */
function blockquote(t, ctx) {
  const quoteStyle = (first) => ({
    spacing: { line: LINE_15, after: 120, before: first ? 200 : 0 },
    indent: { left: convertInchesToTwip(0.35), right: convertInchesToTwip(0.15) },
    shading: { type: ShadingType.CLEAR, fill: 'FFF6E0' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'E0A030', space: 8 } },
    alignment: AlignmentType.LEFT,
  });

  const out = [];
  let first = true;
  for (const inner of t.tokens) {
    if (inner.type === 'paragraph' || inner.type === 'text') {
      out.push(new Paragraph({
        children: runs(inner.tokens || [{ type: 'text', text: inner.text }]),
        ...quoteStyle(first),
      }));
      first = false;
    } else if (inner.type === 'list') {
      for (const item of inner.items) {
        const head = (item.tokens || [])[0];
        out.push(new Paragraph({
          children: runs(head?.tokens || [{ type: 'text', text: item.text }]),
          numbering: { reference: inner.ordered ? 'ol' : 'ul', level: 0 },
          ...quoteStyle(false),
          indent: { left: convertInchesToTwip(0.65), hanging: convertInchesToTwip(0.25) },
        }));
      }
      first = false;
    } else {
      out.push(...convertToken(inner, ctx));
      first = false;
    }
  }
  out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  return out;
}

function list(t, ctx) {
  const out = [];
  const walk = (lst, depth) => {
    for (const item of lst.items) {
      const [first, ...rest] = item.tokens || [];
      const inline = first && (first.type === 'text' || first.type === 'paragraph')
        ? runs(first.tokens || [{ type: 'text', text: first.text }])
        : [text(item.text || '')];
      out.push(new Paragraph({
        children: inline,
        numbering: { reference: lst.ordered ? 'ol' : 'ul', level: Math.min(depth, 2) },
        spacing: { line: LINE_15, after: 100 },
        alignment: AlignmentType.LEFT,
      }));
      for (const sub of rest) {
        if (sub.type === 'list') walk(sub, depth + 1);
        else out.push(...convertToken(sub, ctx));
      }
    }
  };
  walk(t, 0);
  out.push(spacer());
  return out;
}

function table(t) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border,
                    insideHorizontal: border, insideVertical: border };
  const cell = (tok, isHead) => new TableCell({
    children: [new Paragraph({
      children: runs(tok.tokens || [{ type: 'text', text: tok.text }], { bold: isHead })
        .map((r) => r),
      spacing: { line: 240, before: 40, after: 40 },
      alignment: AlignmentType.LEFT,
    })],
    shading: isHead ? { type: ShadingType.CLEAR, fill: 'ECECEC' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
  });

  const rows = [
    new TableRow({ children: t.header.map((h) => cell(h, true)), tableHeader: true }),
    ...t.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
  ];
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders });
}

function code(t) {
  if (t.lang === 'mermaid') return figure(t);
  const lines = String(t.text).split('\n');
  return [
    ...lines.map((ln, i) => new Paragraph({
      children: [new TextRun({ text: ln || ' ', font: MONO, size: half(9.5) })],
      spacing: { line: 240, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0 },
      shading: { type: ShadingType.CLEAR, fill: 'F4F4F4' },
      indent: { left: convertInchesToTwip(0.25) },
      alignment: AlignmentType.LEFT,
    })),
  ];
}

/** A Mermaid block: the rendered PNG if we have it, its source if we do not. */
function figure(t) {
  const png = nextFigure();
  if (!png) {
    figures.push({ rendered: false });
    return [
      new Paragraph({
        children: [text('[Figure — diagram source below; render and paste the image here]',
          { italics: true, color: '888888', size: half(10) })],
        spacing: { before: 160, after: 80 }, alignment: AlignmentType.CENTER,
      }),
      ...code({ text: t.text, lang: 'text' }),
    ];
  }
  const { width, height } = pngSize(png);
  const scale = Math.min(MAX_W / width, MAX_H / height, 1);
  figures.push({ rendered: true, file: png });
  return [new Paragraph({
    children: [new ImageRun({
      data: fs.readFileSync(png), type: 'png',
      transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 240 },
  })];
}

// ── Title page ─────────────────────────────────────────────────────────────
function titlePage() {
  const c = (s, opts = {}) => new Paragraph({
    children: [text(s, opts)], alignment: AlignmentType.CENTER,
    spacing: { line: LINE_15, after: opts.after ?? 160 },
  });
  const gap = (n = 1) => Array.from({ length: n }, () => new Paragraph({ children: [] }));
  return [
    ...gap(2),
    c('VOXPREP', { bold: true, size: half(24) }),
    ...gap(1),
    c('AN AI-DRIVEN CONVERSATIONAL PLATFORM FOR SPOKEN INTERVIEW REHEARSAL AND AUTOMATED WRITTEN EXAMINATION FROM USER-SUPPLIED MATERIAL',
      { bold: true, size: half(15) }),
    ...gap(2),
    c('BY', { size: half(13) }),
    c('⟨FULL NAME⟩', { bold: true, size: half(14) }),
    c('⟨INDEX / MATRICULATION NUMBER⟩', { bold: true, size: half(13) }),
    ...gap(2),
    c('A Project Report Submitted to the ⟨Department of Computer Science⟩, ⟨Faculty / School⟩, ⟨University⟩, in Partial Fulfilment of the Requirements for the Award of the Degree of'),
    ...gap(1),
    c('BACHELOR OF SCIENCE (BSc.) IN COMPUTER SCIENCE', { bold: true, size: half(13) }),
    ...gap(2),
    c('SUPERVISOR: ⟨Title and Full Name⟩', { bold: true }),
    ...gap(2),
    c('⟨MONTH⟩ ⟨YEAR⟩', { bold: true, size: half(13) }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Assembly ───────────────────────────────────────────────────────────────
function readChapter(file) {
  let md = fs.readFileSync(path.join(THESIS_DIR, file), 'utf8');
  // Strip web navigation footers — meaningless on paper.
  md = md.replace(/\n\*\*(Previous|Next|Back to):\*\*.*$/gm, '');
  md = md.replace(/\n---\s*\n\s*$/g, '\n');
  return md;
}

function frontMatterBlocks() {
  let md = readChapter('00-front-matter.md');
  // The title page is built programmatically; drop the HTML-centred source and
  // the file's own H1, and start at the Declaration.
  const start = md.indexOf('## Declaration');
  md = md.slice(start);
  // Replace the hand-written contents table with a field Word can update.
  const tocStart = md.indexOf('## Table of Contents');
  const tocEnd = md.indexOf('## List of Figures');
  const before = md.slice(0, tocStart);
  const after = md.slice(tocEnd);

  const ctx = { firstHeadingUsed: false };
  return [
    ...convertTokens(marked.lexer(before), ctx),
    new Paragraph({
      children: [text('Table of Contents', { bold: true, size: half(16) })],
      heading: HeadingLevel.HEADING_1, pageBreakBefore: true,
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [text('Right-click the field below in Word and choose "Update Field" to generate entries and page numbers from the headings in this document.',
        { italics: true, size: half(10), color: '777777' })],
      spacing: { after: 200 },
    }),
    new TableOfContents('Contents', {
      hyperlink: true, headingStyleRange: '1-3', captionLabel: undefined,
    }),
    new Paragraph({ children: [new PageBreak()] }),
    ...convertTokens(marked.lexer(after), ctx),
  ];
}

function bodyBlocks() {
  const ctx = { firstHeadingUsed: false };
  const out = [];
  for (const file of ORDER.slice(1)) {
    const md = readChapter(file);
    out.push(...convertTokens(marked.lexer(md), ctx));
  }
  return out;
}

function footer(format) {
  return new Footer({
    children: [new Paragraph({
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: half(11) })],
      alignment: AlignmentType.CENTER,
    })],
  });
}

const pageSetup = {
  size: { width: 11906, height: 16838 },              // A4 portrait, twips
  margin: {
    top: convertInchesToTwip(1), bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1.5),                    // binding edge
    right: convertInchesToTwip(1),
  },
};

const doc = new Document({
  creator: 'VoxPrep project',
  title: 'VoxPrep — Project Report',
  description: 'AI-driven conversational platform for spoken interview rehearsal and automated written examination',
  styles: {
    default: {
      document: { run: { font: FONT, size: half(BODY_PT) },
                  paragraph: { spacing: { line: LINE_15, after: 160 } } },
      heading1: { run: { font: FONT, size: half(17), bold: true, color: '000000' },
                  paragraph: { spacing: { before: 0, after: 320, line: 276 } } },
      heading2: { run: { font: FONT, size: half(14.5), bold: true, color: '000000' },
                  paragraph: { spacing: { before: 320, after: 160, line: 276 } } },
      heading3: { run: { font: FONT, size: half(13), bold: true, color: '000000' },
                  paragraph: { spacing: { before: 260, after: 130, line: 276 } } },
      heading4: { run: { font: FONT, size: half(12), bold: true, italics: true, color: '000000' },
                  paragraph: { spacing: { before: 220, after: 110, line: 276 } } },
    },
  },
  numbering: {
    config: [
      { reference: 'ul', levels: [0, 1, 2].map((l) => ({
          level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][l], alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.3 + l * 0.3), hanging: convertInchesToTwip(0.22) } } },
        })) },
      { reference: 'ol', levels: [0, 1, 2].map((l) => ({
          level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l],
          text: `%${l + 1}.`, alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.3 + l * 0.3), hanging: convertInchesToTwip(0.25) } } },
        })) },
    ],
  },
  sections: [
    { // Title page — unnumbered
      properties: { page: { ...pageSetup, pageNumbers: { start: 1, formatType: 'lowerRoman' } },
                    titlePage: false },
      children: titlePage(),
    },
    { // Front matter — roman numerals
      properties: { page: { ...pageSetup, pageNumbers: { start: 2, formatType: 'lowerRoman' } } },
      footers: { default: footer('lowerRoman') },
      children: frontMatterBlocks(),
    },
    { // Body — arabic, restarting at 1
      properties: { page: { ...pageSetup, pageNumbers: { start: 1, formatType: 'decimal' } } },
      footers: { default: footer('decimal') },
      children: bodyBlocks(),
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);

const rendered = figures.filter((f) => f.rendered).length;
console.log(`Wrote ${OUT} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Figures: ${rendered} embedded, ${figures.length - rendered} as source blocks (of ${figures.length})`);
