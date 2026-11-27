// Lists which images are still missing and writes IMAGES_NEEDED.md.
//   node scripts/images.mjs            -> report
// Drop files in src/assets/images/<kind>/<id>.png (png, jpg, webp or gif). No code change needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gen = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/generated', f), 'utf8'));
const have = (kind, id) => ['png', 'jpg', 'jpeg', 'webp', 'gif'].some((e) => fs.existsSync(path.join(ROOT, 'src/assets/images', kind, `${id}.${e}`)));

const mobs = gen('mobs.json');
const groups = [
  { kind: 'mobs', title: 'Mobs (Blockbench render or screenshot, ~4:3 landscape)', required: true, list: mobs.filter((m) => !m.boss).map((m) => ({ id: m.id, name: m.name })) },
  { kind: 'bosses', title: 'Bosses (Blockbench render or screenshot, ~4:3 landscape)', required: true, list: mobs.filter((m) => m.boss).map((m) => ({ id: m.id, name: m.name })) },
  { kind: 'biomes', title: 'Biomes (screenshot, 16:9)', required: true, list: gen('biomes.json').map((b) => ({ id: b.id, name: b.name })) },
  { kind: 'items', title: 'Items (optional: the 16x16 or 32x32 texture PNG, square)', required: false, list: gen('items.json').map((i) => ({ id: i.id, name: i.name })) },
  { kind: 'blocks', title: 'Blocks (optional: a rendered block or the texture, square)', required: false, list: gen('blocks.json').map((b) => ({ id: b.id, name: b.name })) },
];

let md = `# Images still needed\n\nPut each file at \`src/assets/images/<folder>/<id>.png\` (png, jpg, webp or gif all work). Until a file exists the wiki shows a "No image yet" placeholder.\n\nRe-run \`npm run images\` any time to refresh this list.\n`;
let total = 0;
for (const g of groups) {
  const missing = g.list.filter((x) => !have(g.kind, x.id));
  total += g.required ? missing.length : 0;
  console.log(`${g.kind.padEnd(7)} ${g.list.length - missing.length}/${g.list.length} present${g.required ? '' : ' (optional)'}`);
  md += `\n## ${g.title}\n\n${missing.length ? `Missing ${missing.length} of ${g.list.length}:\n\n` + missing.map((x) => `- [ ] \`${g.kind}/${x.id}.png\`  (${x.name})`).join('\n') : 'All present.'}\n`;
}
fs.writeFileSync(path.join(ROOT, 'IMAGES_NEEDED.md'), md);
console.log(`\nIMAGES_NEEDED.md written (${total} required images missing)`);
