/** VoxPrep thesis: Markdown -> print-styled HTML -> PDF (A4). */
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { createRequire } from 'node:module';

// Reuse the Puppeteer (and its Chromium download) that came with mermaid-cli.
const MM = 'C:/Users/JOSEPH~1/AppData/Local/Temp/claude/D--VoxPrep/e310bc6c-c656-47b7-a24f-75c67411fba3/scratchpad/mm/package.json';
const puppeteer = createRequire(MM)('puppeteer');

const THESIS = 'D:/VoxPrep/docs/thesis';
const DIAGRAMS = './diagrams';
const OUT_HTML = './thesis.html';
const OUT_PDF = './VoxPrep-Thesis.pdf';

const ORDER = [
  '00-front-matter.md', '01-introduction.md', '02-literature-review.md',
  '03-methodology.md', '04-implementation.md', '05-testing-and-evaluation.md',
  '06-conclusion.md', 'references.md', 'appendices.md',
];

// Diagrams substitute into mermaid fences in document order.
let figIdx = 0;
const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang === 'mermaid') {
        const f = path.join(DIAGRAMS, `fig-${String(figIdx++).padStart(2, '0')}.png`);
        if (fs.existsSync(f)) return `<figure class="diagram"><img src="${dataUri(f)}" alt="Figure"></figure>`;
        return `<pre class="mermaid-src">${text.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c]))}</pre>`;
      }
      const esc = String(text).replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c]));
      return `<pre><code>${esc}</code></pre>`;
    },
  },
});

function chapterHtml(file) {
  let md = fs.readFileSync(path.join(THESIS, file), 'utf8');
  md = md.replace(/\n\*\*(Previous|Next|Back to):\*\*.*$/gm, '');
  md = md.replace(/\n---\s*\n\s*$/g, '\n');
  if (file === '00-front-matter.md') {
    // Keep the centred title block; drop the file's own H1 and the note above it.
    md = md.replace(/^# Front Matter\s*\n/, '');
  }
  return marked.parse(md);
}

const body = ORDER.map((f, i) =>
  `<section class="chapter${i === 0 ? ' front' : ''}">${chapterHtml(f)}</section>`).join('\n');

const css = `
@page { size: A4; margin: 22mm 18mm 20mm 28mm; }
/* A printed document is light. Opt out of the browser's dark-mode inversion,
   which otherwise renders black text on a black page. */
:root { color-scheme: only light; }
html { background: #ffffff; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; font-size: 11.5pt; line-height: 1.55;
       color: #111111; background: #ffffff; margin: 0; text-align: justify; hyphens: auto;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4, p, li, td, th, figcaption { color: #111111; }
.chapter { break-before: page; }
.chapter.front { break-before: auto; }
h1 { font-size: 19pt; margin: 0 0 18pt; break-before: page; break-after: avoid; text-align: left; }
.chapter.front h1 { break-before: auto; }
section > h1:first-child { break-before: auto; }
h2 { font-size: 14.5pt; margin: 22pt 0 9pt; break-after: avoid; text-align: left; }
h3 { font-size: 12.5pt; margin: 17pt 0 7pt; break-after: avoid; text-align: left; }
h4 { font-size: 11.5pt; font-style: italic; margin: 13pt 0 5pt; break-after: avoid; text-align: left; }
p { margin: 0 0 9pt; orphans: 3; widows: 3; }
strong { font-weight: 700; }
code { font-family: Consolas, "Courier New", monospace; font-size: 0.87em; color: #9c1d3d; }
pre { background: #f5f5f5; border: 1px solid #e2e2e2; border-radius: 3px; padding: 8pt 10pt;
      font-size: 8.6pt; line-height: 1.4; overflow-x: hidden; white-space: pre-wrap;
      word-break: break-word; break-inside: avoid; margin: 9pt 0; }
pre code { color: #222; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0 13pt; font-size: 9pt;
        break-inside: auto; text-align: left; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #bbb; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { background: #ececec; font-weight: 700; }
blockquote { background: #fff6e0; border-left: 3pt solid #e0a030; margin: 11pt 0;
             padding: 8pt 11pt; break-inside: avoid; text-align: left; }
blockquote p:last-child { margin-bottom: 0; }
ul, ol { margin: 0 0 10pt; padding-left: 20pt; text-align: left; }
li { margin-bottom: 4pt; }
figure.diagram { margin: 13pt 0 16pt; text-align: center; break-inside: avoid; }
figure.diagram img { max-width: 100%; max-height: 215mm; height: auto; }
hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
a { color: #14418f; text-decoration: none; }
div[align="center"] { text-align: center; }
div[align="center"] h1 { break-before: auto; text-align: center; font-size: 22pt; }
div[align="center"] h2 { text-align: center; font-size: 14pt; font-weight: 700; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>VoxPrep — Project Report</title><style>${css}</style></head>
<body>${body}</body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log(`HTML written (${(html.length / 1024 / 1024).toFixed(2)} MB), ${figIdx} figures embedded`);

// mermaid-cli only fetched chrome-headless-shell, which cannot print. Use an
// installed Chrome if one is present, else fall back to whatever Puppeteer has.
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
console.log(executablePath ? `Browser: ${executablePath}` : 'Browser: puppeteer default');

const browser = await puppeteer.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
await page.pdf({
  path: OUT_PDF,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-family:'Times New Roman',serif;font-size:9pt;
      color:#444;text-align:center;padding-top:4mm;">
      <span class="pageNumber"></span></div>`,
  margin: { top: '22mm', bottom: '20mm', left: '28mm', right: '18mm' },
});
await browser.close();

const size = fs.statSync(OUT_PDF).size;
console.log(`Wrote ${OUT_PDF} (${(size / 1024 / 1024).toFixed(2)} MB)`);
