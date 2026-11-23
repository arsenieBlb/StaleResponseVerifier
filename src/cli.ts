import { mkdir, writeFile } from 'node:fs/promises';
import { candidates } from './candidates/index.ts';
import { evaluate, toMarkdown } from './evaluate.ts';

const started = performance.now();
const report = await evaluate(candidates);
const elapsedMs = Math.round(performance.now() - started);

const outDir = new URL('../reports/', import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL('evaluation.json', outDir), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL('summary.md', outDir), toMarkdown(report));

console.log(toMarkdown(report));
console.log(`Finished in ${elapsedMs} ms. Reports written to reports/evaluation.json and reports/summary.md.`);
