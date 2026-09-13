/** Pull every ```mermaid block out of the thesis, in document order. */
import fs from 'node:fs';
import path from 'node:path';

const THESIS = 'D:/VoxPrep/docs/thesis';
const OUT = './mmd';
const ORDER = [
  '00-front-matter.md', '01-introduction.md', '02-literature-review.md',
  '03-methodology.md', '04-implementation.md', '05-testing-and-evaluation.md',
  '06-conclusion.md', 'references.md', 'appendices.md',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
const manifest = [];
for (const file of ORDER) {
  const md = fs.readFileSync(path.join(THESIS, file), 'utf8');
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) {
    const id = String(n).padStart(2, '0');
    fs.writeFileSync(path.join(OUT, `fig-${id}.mmd`), m[1].trimEnd() + '\n');
    manifest.push({ id, file, kind: m[1].trim().split('\n')[0] });
    n += 1;
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`Extracted ${n} diagrams`);
for (const d of manifest) console.log(`  fig-${d.id}  ${d.kind.padEnd(18)} ${d.file}`);
