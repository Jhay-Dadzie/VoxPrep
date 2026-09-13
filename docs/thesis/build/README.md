# Thesis build toolchain

Regenerates `VoxPrep-Thesis.docx` and `VoxPrep-Thesis.pdf` from the Markdown
chapters in the parent directory. Run these after editing any chapter — the
Word and PDF files are build products, not sources. **Edit the Markdown, not
the `.docx`**, unless you have decided to stop regenerating and finish the
document by hand in Word (which is a perfectly reasonable thing to do once the
content is settled).

## One-time setup

```bash
cd docs/thesis/build
npm init -y
npm install docx@9 marked@14
```

For diagram rendering and PDF output you also need Mermaid CLI. It downloads a
browser, so it is slow the first time:

```bash
npm install @mermaid-js/mermaid-cli
```

The PDF step needs a Chrome or Edge installation. `pdf.mjs` looks for one at the
usual Windows locations and falls back to Puppeteer's own browser.

## Rebuilding

```bash
# 1. Pull the mermaid blocks out of the chapters, in document order
node extract-diagrams.mjs

# 2. Render them to PNG at print resolution
for f in mmd/fig-*.mmd; do
  npx mmdc -i "$f" -o "diagrams/$(basename "$f" .mmd).png" -b white -s 3 -q
done

# 3. Build the Word document
node convert.mjs ../ ./diagrams ../VoxPrep-Thesis.docx

# 4. Build the PDF
node pdf.mjs
```

Steps 1–2 are only needed when a diagram changes. `convert.mjs` embeds whatever
PNGs it finds in `diagrams/` and falls back to printing the diagram source in a
code block for any it does not find, so step 3 works on its own.

## What the build does

| Concern | Handling |
| --- | --- |
| Page setup | A4, 1.5 in binding margin, 1 in elsewhere |
| Body text | Times New Roman 12 pt, 1.5 line spacing, justified |
| Front matter | Roman numerals; body restarts at arabic 1 |
| Contents | A live Word TOC field — right-click and **Update Field** to populate |
| Chapters | Each starts on a new page |
| Diagrams | 18 Mermaid figures rendered at 3× and embedded, scaled to fit |
| Tables | Repeating header rows, 9 pt, full width |
| Author notes | Kept, shaded amber with a left rule, so they are easy to find and delete |
| Web navigation | The "Previous / Next" footers are stripped |
| Hard wrapping | Source newlines are collapsed so Word reflows paragraphs |

## Known limitations

- **The TOC field is empty until you update it.** Word populates it from the
  heading styles on demand; this is normal, and the document tells the reader so.
- **Lists of Figures and Tables are static.** They are Markdown tables carried
  through verbatim. To make Word generate them, you would need to convert each
  figure and table caption into a Word caption with a `SEQ` field — worth doing
  once the content is final, not before.
- **PDF page numbers run continuously.** Roman-then-arabic numbering is applied
  in the DOCX only; the PDF is for reading and review.
- **Author-guidance blocks are still present** in both outputs. Delete them
  before submission — see the checklist in [`../README.md`](../README.md).
