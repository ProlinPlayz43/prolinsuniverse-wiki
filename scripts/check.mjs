// Build guard: fails `npm run build` (and therefore the deploy) if anything that isn't part of the
// documented version could reach the public site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const problems = [];

const versions = readJson(path.join(ROOT, 'src/data/versions.json'));
const cur = versions.current;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };

// 1. manifest for the current version must exist and be approved
const mp = path.join(ROOT, `src/data/manifests/${cur}.json`);
if (!fs.existsSync(mp)) problems.push(`missing manifest src/data/manifests/${cur}.json (run npm run gen)`);
else if (!readJson(mp).approved) problems.push(`manifest ${cur}.json is not approved ("approved": true is required to build)`);

// 2. nothing in generated data may be newer than the current version
const gen = path.join(ROOT, 'src/data/generated');
for (const f of ['mobs', 'items', 'blocks', 'biomes']) {
  const p = path.join(gen, `${f}.json`);
  if (!fs.existsSync(p)) { problems.push(`missing generated data ${f}.json (run npm run gen)`); continue; }
  for (const e of readJson(p)) if (!e.since || cmp(e.since, cur) > 0) problems.push(`${f}:${e.id} has since=${e.since ?? 'missing'} (current is ${cur})`);
}

// 3. every content page must declare `since` and not exceed the current version
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
const docs = path.join(ROOT, 'src/content/docs');
for (const f of walk(docs).filter((x) => /\.mdx?$/.test(x))) {
  const rel = path.relative(docs, f).replaceAll('\\', '/');
  const fm = fs.readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const since = fm.match(/^since:\s*["']?([\d.]+)["']?/m)?.[1];
  const needs = /^(mobs|bosses)\//.test(rel) && !/index\.mdx?$/.test(rel);
  if (needs && !since) problems.push(`${rel}: missing "since" in frontmatter`);
  if (since && cmp(since, cur) > 0) problems.push(`${rel}: since ${since} is newer than current ${cur} (unreleased content)`);
}

// 4. changelog may not list future versions
const cl = path.join(ROOT, 'src/data/changelog.json');
if (fs.existsSync(cl)) for (const e of readJson(cl)) if (cmp(e.version, cur) > 0) problems.push(`changelog lists unreleased version ${e.version}`);

if (problems.length) {
  console.error('\nwiki check failed:\n' + problems.map((p) => '  - ' + p).join('\n') + '\n');
  process.exit(1);
}
console.log(`wiki check ok (documenting v${cur})`);
