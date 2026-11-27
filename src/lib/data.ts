// Single place the site reads its data from. Everything here is plain JSON committed to the repo,
// so the public build never needs the (private) mod source.
import versions from '../data/versions.json';
import mobsJson from '../data/generated/mobs.json';
import itemsJson from '../data/generated/items.json';
import blocksJson from '../data/generated/blocks.json';
import biomesJson from '../data/generated/biomes.json';
import recipesJson from '../data/generated/recipes.json';
import lootJson from '../data/generated/loot-sources.json';
import namesJson from '../data/generated/names.json';
import descriptionsJson from '../data/descriptions.json';

export const site = versions;
export const CURRENT = versions.current as string;

export const descriptions = descriptionsJson as { items: Record<string, string>; blocks: Record<string, string> };

export const mobs: any[] = mobsJson as any[];
export const items: any[] = itemsJson as any[];
export const blocks: any[] = blocksJson as any[];
export const biomes: any[] = biomesJson as any[];
export const recipes: any[] = recipesJson as any[];
export const lootSources: any[] = lootJson as any[];

const names = (namesJson as any).names as Record<string, string>;
const links = (namesJson as any).links as Record<string, string>;

/** Site-absolute URL that respects the `base` path from astro.config.mjs. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export function href(path: string): string {
  const p = path.replace(/^\/+/, '');
  if (!p) return `${BASE}/`;
  return `${BASE}/${p.endsWith('/') || /\.[a-z0-9]+$/i.test(p) ? p : p + '/'}`;
}

export const prettify = (id: string) =>
  id
    .replace(/^#?[a-z0-9_.-]+:/, '')
    .split(/[_/]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

export const mobById = (id: string) => mobs.find((m) => m.id === id);
export const mobHref = (id: string) => href(`${mobById(id)?.boss ? 'bosses' : 'mobs'}/${id}`);

/** Name + (when the thing has a page on this wiki) a link for any namespaced id such as "prolinsuniverse:ruby". */
export function ref(fullId: string): { id: string; name: string; href: string | null; mod: boolean } {
  const isTag = fullId.startsWith('#');
  const id = fullId.replace(/^#/, '');
  const mod = id.startsWith('prolinsuniverse:');
  const name = names[id] ?? prettify(id) + (isTag ? ' (any)' : '');
  const link = links[id];
  return { id, name, href: link ? href(link) : null, mod };
}

export const itemBySlugOrId = (id: string) => items.find((i) => i.id === id || i.slug === id);
export const recipeById = (id: string) => recipes.find((r) => r.id === id);
export const chestName = (id: string) => lootSources.find((l) => l.id === id)?.name ?? prettify(id);

export const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(+n.toFixed(digits));

export const hearts = (hp: number) => `${fmt(hp / 2, 1)} ♥`;

/** Chance 0..1 -> "45%", "0.6%" */
export function pct(c: number): string {
  const v = c * 100;
  return `${v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(1) : +v.toFixed(2)}%`;
}

// ---- images --------------------------------------------------------------------------------
// Drop PNG/JPG/WebP files into src/assets/images/<kind>/<id>.png  (kind = mobs | bosses | items | blocks | biomes)
// and they show up automatically; until then a placeholder is rendered.
const imageFiles = import.meta.glob('/src/assets/images/**/*.{png,jpg,jpeg,webp,gif}', {
  eager: true,
  import: 'default',
}) as Record<string, ImageMetadata>;

export function imageFor(kind: string, id: string, suffix = ''): ImageMetadata | null {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
    const hit = imageFiles[`/src/assets/images/${kind}/${id}${suffix}.${ext}`];
    if (hit) return hit;
  }
  return null;
}
