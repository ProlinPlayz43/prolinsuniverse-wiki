#!/usr/bin/env node
/**
 * Prolins Universe wiki: data generator (DEV-ONLY, run on your machine, never part of the mod jar).
 *
 *   npm run gen -- --mod "D:\IntelliJ\making\projects\ProlinUniverse"
 *
 * Reads the mod source READ-ONLY:
 *   - lang/en_us.json                         display names
 *   - ModItems / ModBlocks / ModEntities      what is actually registered (the Java registry is the truth)
 *   - data recipes + block/chest loot tables  (src/generated + src/main resources)
 *   - biome + biome-modifier JSON             biomes, natural spawn rules
 *   - entity classes                          attributes (health, damage...) and ModEntityDrops drops
 * and writes src/data/generated/*.json (committed to the wiki repo, so CI never needs the private mod source).
 *
 * Phase 2 (later): replace the Java scraping in `extractEntityClass` with an in-game/datagen attribute dump.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/generated');
const NS = 'prolinsuniverse';

// ---------------------------------------------------------------- args
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
    args[k] = v;
  }
}
const MOD = args.mod || process.env.MOD_SRC;
if (!MOD || MOD === true) {
  console.error('Usage: npm run gen -- --mod <path to ProlinUniverse> [--entities <dir with *Entity.java>] [--no-scaffold]');
  process.exit(1);
}
const javaRoot = path.join(MOD, 'src/main/java/com/prolin/prolinsuniverse');
const entityDir = typeof args.entities === 'string' ? args.entities : path.join(javaRoot, 'entity/custom');
const dataRoots = [path.join(MOD, 'src/generated/resources'), path.join(MOD, 'src/main/resources')];
const langFile = path.join(MOD, 'src/main/resources/assets', NS, 'lang/en_us.json');

const versions = readJson(path.join(ROOT, 'src/data/versions.json'));
const CURRENT = versions.current;
const warnings = [];
const warn = (m) => warnings.push(m);

// ---------------------------------------------------------------- helpers
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(p); }
function writeJson(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n');
}
function listJson(rel) {
  const out = new Map(); // id -> file (main overrides generated if both exist)
  for (const root of dataRoots) {
    const dir = path.join(root, rel);
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json')) out.set(f.slice(0, -5), path.join(dir, f));
    }
  }
  return [...out.entries()].map(([id, file]) => ({ id, file }));
}
function readDataJson(rel) {
  for (const root of [...dataRoots].reverse()) {
    const p = path.join(root, rel);
    if (exists(p)) return readJson(p);
  }
  return null;
}
const prettify = (id) => id.replace(/^#?[a-z0-9_.-]+:/, '').split(/[_/]/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const stripNs = (id) => id.replace(/^[a-z0-9_.-]+:/, '');
const num = (s) => (s === undefined || s === null || s === '' ? null : Number(String(s).replace(/[fFdDlL]$/, '')));
const round = (n, d = 4) => (n === null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function precedingComment(src, idx) {
  const before = src.slice(0, idx).replace(/\s+$/, '');
  let text = '';
  if (before.endsWith('*/')) {
    const start = before.lastIndexOf('/*');
    text = before.slice(start).replace(/^\/\*+|\*\/$/g, '').replace(/^\s*\*+ ?/gm, '');
  } else {
    const lines = before.split('\n');
    const c = [];
    while (lines.length && /^\s*\/\//.test(lines[lines.length - 1])) c.unshift(lines.pop().replace(/^\s*\/\/\s?/, ''));
    text = c.join(' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Return the substring starting at the "(" at openIdx up to its matching ")" (inclusive). */
function balanced(src, openIdx) {
  let depth = 0, inStr = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}
function splitTop(s) {
  const out = []; let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { cur += c; if (c === '\\') cur += s[++i]; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; cur += c; continue; }
    if (c === '(' || c === '<' || c === '{') depth++;
    if (c === ')' || c === '>' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------- previous output (keeps `since` stable across runs)
function previous(name) {
  const p = path.join(OUT, name);
  return exists(p) ? readJson(p) : [];
}
function sinceFor(prev, id) {
  const hit = prev.find((e) => e.id === id);
  return hit?.since ?? CURRENT;
}

// ---------------------------------------------------------------- manifest (what is in this version)
const manifestPath = path.join(ROOT, `src/data/manifests/${CURRENT}.json`);
let manifest = exists(manifestPath) ? readJson(manifestPath) : { version: CURRENT, approved: false, exclude: [] };
const excluded = new Set(manifest.exclude ?? []);
const included = (kind, id) => !excluded.has(`${kind}:${id}`);

// ---------------------------------------------------------------- lang
if (!exists(langFile)) { console.error('lang file not found: ' + langFile); process.exit(1); }
const lang = readJson(langFile);
const nameOf = (kind, id) => lang[`${kind}.${NS}.${id}`];

// ---------------------------------------------------------------- tool tiers + armour materials
const tiers = {};
{
  const p = path.join(javaRoot, 'item/ModToolTiers.java');
  if (exists(p)) {
    const src = stripComments(readText(p));
    for (const m of src.matchAll(/Tier\s+(\w+)\s*=\s*new SimpleTier\(\s*[\w.]+\s*,\s*([\d.]+)\s*,\s*([\d.]+)[fF]?\s*,\s*([\d.]+)[fF]?\s*,\s*(\d+)/g)) {
      tiers[m[1]] = { durability: num(m[2]), miningSpeed: num(m[3]), attackBonus: num(m[4]), enchantability: num(m[5]) };
    }
  }
}
const armorMaterials = {};
{
  const p = path.join(javaRoot, 'item/ModArmorMaterials.java');
  if (exists(p)) {
    const src = stripComments(readText(p));
    const re = /Holder<ArmorMaterial>\s+(\w+)\s*=\s*register\("(\w+)"([\s\S]*?)\}\)\s*,\s*(\d+)\s*,\s*([\d.]+)[fF]?\s*,\s*([\d.]+)[fF]?\s*,/g;
    for (const m of src.matchAll(re)) {
      const slots = {};
      for (const s of m[3].matchAll(/ArmorItem\.Type\.(\w+)\s*,\s*(\d+)/g)) slots[s[1].toLowerCase()] = num(s[2]);
      armorMaterials[m[1]] = { name: m[2], defense: slots, enchantability: num(m[4]), toughness: num(m[5]), knockbackResistance: num(m[6]) };
    }
  }
}
const foods = {};
{
  const p = path.join(javaRoot, 'item/ModFoodProperties.java');
  if (exists(p)) {
    const src = stripComments(readText(p));
    for (const m of src.matchAll(/FoodProperties\s+(\w+)\s*=\s*new FoodProperties\.Builder\(\)([\s\S]*?)\.build\(\)/g)) {
      const nutrition = num(m[2].match(/nutrition\((\d+)\)/)?.[1]);
      const sat = num(m[2].match(/saturationModifier\(([\d.]+)/)?.[1]);
      const effects = [...m[2].matchAll(/MobEffects\.(\w+)\s*,\s*(\d+)\)\s*,\s*([\d.]+)f?/g)].map((e) => ({
        effect: prettify(e[1].toLowerCase()), seconds: num(e[2]) / 20, chance: num(e[3]),
      }));
      foods[m[1]] = { nutrition, saturation: sat === null ? null : round(nutrition * sat * 2, 2), effects };
    }
  }
}

// ---------------------------------------------------------------- items
function groupItem(it) {
  const id = it.id;
  if (it.kind !== 'misc') return it.kind;
  if (/(_ingot|_nugget|^raw_|_shard|_fragment|^ruby$|_cluster)/.test(id)) return 'material';
  return 'misc';
}
const itemsRaw = [];
{
  const src = readText(path.join(javaRoot, 'item/ModItems.java'));
  const re = /public\s+static\s+final\s+DeferredItem<([^=]*?)>\s+(\w+)\s*=\s*ITEMS\.register\("([^"]+)"/g;
  const hits = [...src.matchAll(re)];
  hits.forEach((m, i) => {
    const block = src.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : src.indexOf('public static void register', m.index));
    const body = stripComments(block);
    const id = m[3];
    const type = m[1].trim();
    const ctor = body.match(/->\s*new\s+([\w.]+)\s*\(/)?.[1]?.split('.').pop() ?? null;
    const it = { id, field: m[2], javaType: type, ctor, devNote: precedingComment(src, m.index) || undefined, kind: 'misc' };
    const tier = body.match(/ModToolTiers\.(\w+)/)?.[1];
    const armorMat = body.match(/ModArmorMaterials\.(\w+)/)?.[1];
    const slot = body.match(/ArmorItem\.Type\.(\w+)/)?.[1];
    if (/spawnegg|spawn_egg/.test(id) || /SpawnEgg/.test(body)) it.kind = 'spawn_egg';
    else if (type === 'ArmorItem' || /ArmorItem\(/.test(body) || /_(helmet|chestplate|leggings|boots)$/.test(id)) it.kind = 'armor';
    else if (type === 'SwordItem' || type === 'MaceItem') it.kind = 'weapon';
    else if (id === 'xerion_excavator') it.kind = 'tool';
    else if (['PickaxeItem', 'AxeItem', 'ShovelItem', 'HoeItem'].includes(type)) it.kind = 'tool';
    else if (/_bow$|_gun$|_staff$/.test(id)) it.kind = 'weapon';
    else if (/\.food\(/.test(body)) it.kind = 'food';
    else if (/bucket/.test(id)) it.kind = 'misc';
    it.kind = it.kind === 'misc' ? groupItem(it) : it.kind;

    const rarity = body.match(/Rarity\.(\w+)/)?.[1];
    if (rarity) it.rarity = prettify(rarity.toLowerCase());
    const stack = body.match(/stacksTo\((\d+)\)/)?.[1];
    if (stack) it.stackSize = num(stack);
    if (/fireResistant\(\)/.test(body)) it.fireResistant = true;
    const dur = body.match(/\.durability\((\d+)\)/)?.[1];
    if (dur) it.durability = num(dur);

    if (tier && tiers[tier]) {
      const t = tiers[tier];
      const ca = body.match(/createAttributes\(\s*ModToolTiers\.\w+\s*,\s*(-?[\d.]+)[fF]?\s*,\s*(-?[\d.]+)[fF]?\s*\)/);
      it.tier = tier.toLowerCase();
      it.durability ??= t.durability;
      it.miningSpeed = t.miningSpeed;
      it.enchantability = t.enchantability;
      if (ca) {
        it.attackDamage = round(1 + num(ca[1]) + t.attackBonus, 2);
        it.attackSpeed = round(4 + num(ca[2]), 2);
      } else if (/createAttributes\(\)/.test(body)) {
        it.customStats = true; // attributes come from the item's own class: fill in via overrides
      }
    }
    if (armorMat && armorMaterials[armorMat]) {
      const a = armorMaterials[armorMat];
      const s = (slot || id.split('_').pop()).toLowerCase();
      it.armor = { material: a.name, slot: s, defense: a.defense[s] ?? null, toughness: a.toughness, knockbackResistance: a.knockbackResistance, enchantability: a.enchantability };
      const mult = body.match(/getDurability\((\d+)\)/)?.[1];
      if (mult) {
        const base = { boots: 13, leggings: 15, chestplate: 16, helmet: 11 }[s];
        if (base) it.durability = base * num(mult);
      }
    } else if (it.kind === 'armor' && !armorMat) {
      // custom armour classes (e.g. Hemacite): material is set inside the class
      const matByName = Object.values(armorMaterials).find((m) => id.startsWith(m.name + '_'));
      if (matByName) {
        const s = id.split('_').pop();
        it.armor = { material: matByName.name, slot: s, defense: matByName.defense[s] ?? null, toughness: matByName.toughness, knockbackResistance: matByName.knockbackResistance, enchantability: matByName.enchantability };
      }
    }
    const food = body.match(/ModFoodProperties\.(\w+)/)?.[1];
    if (food && foods[food]) it.food = foods[food];
    else if (/\.food\(/.test(body)) {
      const nutrition = num(body.match(/nutrition\((\d+)\)/)?.[1]);
      const sat = num(body.match(/saturationModifier\(([\d.]+)/)?.[1]);
      if (nutrition !== null) it.food = { nutrition, saturation: sat === null ? null : round(nutrition * sat * 2, 2), effects: [] };
    }
    itemsRaw.push(it);
  });
}

// ---------------------------------------------------------------- blocks
function groupBlock(id) {
  if (/_ore$/.test(id)) return 'ore';
  if (/spawner|portal|teleport|gemcutter|enchanting|bookshelf|duplicator|foxfire|bloodspewer|test_fluid/.test(id)) return 'functional';
  if (/^(raw_)?(tynite|ruby|radonite|xenonite|urubithium|solaris|kyrion|noctyrite|riftsteel)_block$/.test(id)) return 'metal';
  if (/arterwood/.test(id)) return 'wood';
  if (/hemastone|uru_|calcite|cragcane|nest/.test(id)) return 'natural';
  return 'other';
}
const blocksRaw = [];
{
  const src = readText(path.join(javaRoot, 'block/ModBlocks.java'));
  const re = /public\s+static\s+final\s+DeferredBlock<([^=]*?)>\s+(\w+)\s*=\s*(registerBlock|BLOCKS\.register)\(\s*"([^"]+)"/g;
  const hits = [...src.matchAll(re)];
  hits.forEach((m, i) => {
    const block = src.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : src.indexOf('private static <T extends Block>', m.index));
    const body = stripComments(block);
    const id = m[4];
    const b = { id, field: m[2], javaType: m[1].trim(), devNote: precedingComment(src, m.index) || undefined, group: groupBlock(id), hasItem: m[3] === 'registerBlock' };
    b.ctor = body.match(/new\s+([\w.]+)\s*\(/)?.[1]?.split('.').pop() ?? null;
    const st = body.match(/\.strength\(\s*(-?[\d.]+)[fF]?(?:\s*,\s*([\d.]+)[fF]?)?\s*\)/);
    if (st) { b.hardness = num(st[1]); b.blastResistance = num(st[2] ?? st[1]); }
    const ll = body.match(/lightLevel\(\s*\w*\s*->\s*(\d+)\s*\)/)?.[1];
    if (ll) b.lightLevel = num(ll);
    if (/requiresCorrectToolForDrops\(\)/.test(body)) b.requiresTool = true;
    const xp = body.match(/UniformInt\.of\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (xp && /DropExperience/.test(body)) b.xp = [num(xp[1]), num(xp[2])];
    const sound = body.match(/SoundType\.(\w+)/)?.[1];
    if (sound) b.sound = prettify(sound.toLowerCase());
    blocksRaw.push(b);
  });
}

// Blocks registered inside loops (e.g. the 8 Scither nest blocks come from the ScitherType enum) never appear as
// a literal `registerBlock("x")`. The lang file + a block loot table prove they exist, so pick them up from there.
{
  const known = new Set(blocksRaw.map((b) => b.id));
  const lootIds = new Set(listJson(`data/${NS}/loot_table/blocks`).map((x) => x.id));
  const itemIdsAll = new Set(itemsRaw.map((i) => i.id));
  for (const k of Object.keys(lang)) {
    const m = k.match(/^block\.prolinsuniverse\.([a-z0-9_]+)$/);
    if (!m || known.has(m[1]) || !lootIds.has(m[1]) || itemIdsAll.has(m[1])) continue;
    blocksRaw.push({ id: m[1], field: null, javaType: 'dynamic', group: groupBlock(m[1]), hasItem: true, dynamic: true });
  }
}

// ---------------------------------------------------------------- recipes
const recipes = [];
const ingKey = (i) => (Array.isArray(i) ? i.map(ingKey).join('|') : i?.item ?? (i?.tag ? '#' + i.tag : JSON.stringify(i)));
{
  const seen = new Set();
  for (const { id, file } of listJson(`data/${NS}/recipe`)) {
    const r = readJson(file);
    const result = r.result ? { id: r.result.id ?? r.result.item, count: r.result.count ?? 1 } : null;
    const type = String(r.type).replace('minecraft:', '');
    const rec = { id, type, category: r.category ?? null, result };
    if (type === 'crafting_shaped') {
      rec.pattern = r.pattern;
      rec.key = Object.fromEntries(Object.entries(r.key).map(([k, v]) => [k, ingKey(v)]));
      const mirrored = r.pattern.map((row) => [...row].reverse().join(''));
      rec._sig = `${type}|${JSON.stringify(rec.key)}|${[rec.pattern.join('/'), mirrored.join('/')].sort()[0]}|${result.id}|${result.count}`;
    } else if (type === 'crafting_shapeless') {
      const counts = {};
      for (const i of r.ingredients) counts[ingKey(i)] = (counts[ingKey(i)] ?? 0) + 1;
      rec.ingredients = counts;
      rec._sig = `${type}|${JSON.stringify(Object.entries(counts).sort())}|${result.id}|${result.count}`;
    } else if (['smelting', 'blasting', 'smoking', 'campfire_cooking'].includes(type)) {
      rec.ingredient = ingKey(r.ingredient);
      rec.cookingTime = r.cookingtime ?? null;
      rec.experience = r.experience ?? null;
      rec._sig = `${type}|${rec.ingredient}|${result.id}`;
    } else {
      rec.raw = r;
      rec._sig = `${type}|${id}`;
      warn(`recipe ${id}: unsupported type ${r.type} (kept raw)`);
    }
    if (seen.has(rec._sig)) continue; // mirrored/duplicate variants (e.g. *_recipe2)
    seen.add(rec._sig);
    delete rec._sig;
    recipes.push(rec);
  }
}
const recipesByResult = {};
const usedIn = {};
for (const r of recipes) {
  if (!r.result) continue;
  (recipesByResult[r.result.id] ??= []).push(r.id);
  const ings = r.type === 'crafting_shaped' ? Object.values(r.key)
    : r.type === 'crafting_shapeless' ? Object.keys(r.ingredients)
    : r.ingredient ? [r.ingredient] : [];
  for (const i of new Set(ings.flatMap((x) => x.split('|')))) (usedIn[i] ??= new Set()).add(r.id);
}

// ---------------------------------------------------------------- loot tables
function describeLootEntry(entry, ctx = []) {
  const out = [];
  const conds = (entry.conditions ?? []).map((c) => {
    const t = c.condition?.replace('minecraft:', '');
    if (t === 'match_tool') {
      const s = JSON.stringify(c.predicate ?? {});
      if (s.includes('silk_touch')) return 'Silk Touch';
      if (s.includes('shears')) return 'Shears';
      return 'specific tool';
    }
    if (t === 'random_chance') return `${round((c.chance ?? 0) * 100, 2)}% chance`;
    if (t === 'table_bonus') return 'chance rises with enchantment';
    if (t === 'block_state_property') return null;
    if (t === 'survives_explosion') return null;
    if (t === 'any_of' || t === 'inverted') return 'conditional';
    return t;
  }).filter(Boolean);
  if (entry.type === 'minecraft:alternatives') {
    entry.children.forEach((ch, i) => out.push(...describeLootEntry(ch, [...ctx, ...conds, ...(i > 0 ? ['otherwise'] : [])])));
    return out;
  }
  if (entry.type === 'minecraft:item') {
    let count = null, fortune = false;
    for (const f of entry.functions ?? []) {
      const ft = f.function?.replace('minecraft:', '');
      if (ft === 'set_count') {
        const c = f.count;
        count = typeof c === 'number' ? [c, c] : c?.min !== undefined ? [c.min, c.max] : null;
      }
      if (ft === 'apply_bonus') fortune = true;
    }
    out.push({ item: entry.name, count, notes: [...new Set([...ctx, ...conds, ...(fortune ? ['affected by Fortune'] : [])])], weight: entry.weight ?? null });
  } else if (entry.type === 'minecraft:empty') {
    out.push({ item: null, count: null, notes: ctx, weight: entry.weight ?? null });
  }
  return out;
}
const blockDrops = {};
for (const { id, file } of listJson(`data/${NS}/loot_table/blocks`)) {
  const t = readJson(file);
  blockDrops[id] = (t.pools ?? []).flatMap((p) => (p.entries ?? []).flatMap((e) => describeLootEntry(e)));
}
const lootSources = [];
const chestItems = {}; // item id -> [table ids]
for (const { id, file } of listJson(`data/${NS}/loot_table/chests`)) {
  const t = readJson(file);
  const pools = (t.pools ?? []).map((p) => {
    const rolls = typeof p.rolls === 'number' ? [p.rolls, p.rolls] : [p.rolls?.min ?? 1, p.rolls?.max ?? 1];
    const entries = (p.entries ?? []).flatMap((e) => describeLootEntry(e));
    const total = entries.reduce((s, e) => s + (e.weight ?? 1), 0) || 1;
    return {
      rolls,
      entries: entries.filter((e) => e.item).map((e) => ({ item: e.item, count: e.count, weight: e.weight ?? 1, chance: round(((e.weight ?? 1) / total) * 100, 1) })),
    };
  });
  const name = CONFIG.lootTableNames[id] ?? prettify(id);
  lootSources.push({ id, name, pools });
  for (const p of pools) for (const e of p.entries) (chestItems[e.item] ??= new Set()).add(id);
}

// ---------------------------------------------------------------- biome modifiers (spawn rules) + tags
function tagValues(tagId, seen = new Set()) {
  const [ns, name] = tagId.split(':');
  if (ns !== NS || seen.has(tagId)) return null;
  seen.add(tagId);
  const t = readDataJson(`data/${NS}/tags/worldgen/biome/${name}.json`);
  if (!t) return null;
  return t.values.flatMap((v) => (v.startsWith('#') ? (tagValues(v.slice(1), seen) ?? [v]) : [v]));
}
function biomeRef(id) {
  const isTag = id.startsWith('#');
  const raw = id.replace(/^#/, '');
  if (!isTag && raw.startsWith(NS + ':')) {
    const b = stripNs(raw);
    return { id: raw, name: nameOf('biome', b) ?? prettify(b), biome: b };
  }
  if (isTag) {
    const t = tagValues(raw);
    if (t) return { id, name: prettify(stripNs(raw)), expands: t.map(biomeRef) };
    return { id, name: CONFIG.vanillaTagNames[raw] ?? prettify(stripNs(raw).replace(/^is_/, '')) + ' biomes', vanilla: true };
  }
  return { id: raw, name: CONFIG.vanillaBiomeNames?.[raw] ?? prettify(raw), vanilla: true };
}
const spawnRules = {}; // entity id -> [rule]
for (const { id, file } of listJson(`data/${NS}/neoforge/biome_modifier`)) {
  const m = readJson(file);
  if (m.type !== 'neoforge:add_spawns') continue;
  const list = Array.isArray(m.spawners) ? m.spawners : [m.spawners];
  const biomes = (Array.isArray(m.biomes) ? m.biomes : [m.biomes]).map(biomeRef);
  for (const s of list) {
    const ent = stripNs(s.type);
    (spawnRules[ent] ??= []).push({ biomes, weight: s.weight, min: s.minCount, max: s.maxCount, source: id });
  }
}
const flatBiomes = (refs) => refs.flatMap((r) => (r.expands ? flatBiomes(r.expands) : [r]));

// ---------------------------------------------------------------- entities
function entityDrops(src, name) {
  const fields = [...src.matchAll(/ModEntityDrops\s+(\w+)\s*=/g)].map((m) => m[1]);
  const drops = [];
  const unparsed = [];
  const itemRef = (e) => {
    e = e.trim();
    let m;
    if ((m = e.match(/^ModItems\.(\w+)\.get\(\)$/))) return NS + ':' + m[1].toLowerCase();
    if ((m = e.match(/^ModItems\.(\w+)$/))) return NS + ':' + m[1].toLowerCase();
    if ((m = e.match(/^ModBlocks\.(\w+)\.get\(\)\.asItem\(\)$/))) return NS + ':' + m[1].toLowerCase();
    if ((m = e.match(/^(?:net\.minecraft\.world\.item\.)?Items\.(\w+)$/))) return 'minecraft:' + m[1].toLowerCase();
    return null;
  };
  const itemOrList = (e) => {
    e = e.trim();
    const l = e.match(/^(?:List|Arrays)\.(?:of|asList)\(([\s\S]*)\)$/);
    if (l) { const parts = splitTop(l[1]).map(itemRef); return parts.includes(null) ? null : parts; }
    const one = itemRef(e);
    return one ? [one] : null;
  };
  for (const f of fields) {
    const re = new RegExp(`\\b${f}\\.(add\\w*Drop)\\(`, 'g');
    for (const m of src.matchAll(re)) {
      const open = m.index + m[0].length - 1;
      const argStr = balanced(src, open);
      const a = splitTop(argStr.slice(1, -1));
      const kind = m[1];
      let d = null;
      const N = (i) => num(a[i]);
      switch (kind) {
        case 'addUniformDrop': d = { items: itemOrList(a[0]), min: N(1), max: N(1), chance: 1 }; break;
        case 'addRangedDrop': d = { items: itemOrList(a[0]), min: N(1), max: N(2), chance: 1 }; break;
        case 'addProbableUniformDrop': d = { items: itemOrList(a[0]), min: N(2), max: N(2), chance: N(1) }; break;
        case 'addListedUniformDrop': d = { items: itemOrList(a[0]), min: N(1), max: N(1), chance: 1, oneOf: true }; break;
        case 'addProbableListedUniformDrop': d = { items: itemOrList(a[0]), min: N(2), max: N(2), chance: N(1), oneOf: true }; break;
        case 'addProbableListedRangedDrop': d = { items: itemOrList(a[0]), min: N(2), max: N(3), chance: N(1), oneOf: true }; break;
        case 'addAmountedRangedDrop': d = { items: itemOrList(a[0]), min: N(1) * N(3), max: N(2) * N(3), chance: 1, rolls: N(3) }; break;
        case 'addRangedFoodDrop': d = { items: itemOrList(a[0]), cooked: itemRef(a[1]), min: N(2), max: N(3), chance: 1 }; break;
        case 'addProbableRangedFoodDrop': d = { items: itemOrList(a[0]), cooked: itemRef(a[1]), min: N(3), max: N(4), chance: N(2) }; break;
        case 'addUniformFoodDrop': d = { items: itemOrList(a[0]), cooked: itemRef(a[1]), min: N(2), max: N(2), chance: 1 }; break;
        default: break;
      }
      if (!d || !d.items || d.min === null || d.max === null || d.chance === null) {
        unparsed.push(`${name}: ${m[0]}${argStr.replace(/\s+/g, ' ').slice(0, 100)}`);
        continue;
      }
      drops.push(d);
    }
  }
  return { drops, unparsed };
}

function extractEntityClass(className, seen = new Set()) {
  const file = path.join(entityDir, className + '.java');
  if (!exists(file) || seen.has(className)) return null;
  seen.add(className);
  const src = stripComments(readText(file));
  const ext = src.match(new RegExp(`class\\s+${className}\\s+extends\\s+([\\w.]+)`))?.[1]?.split('.').pop() ?? null;
  const parent = ext && /Entity$/.test(ext) ? extractEntityClass(ext, seen) : null;
  const attrs = { ...(parent?.attributes ?? {}) };
  const m = src.match(/createAttributes\s*\(\s*\)\s*\{/);
  if (m) {
    const open = src.indexOf('{', m.index);
    let depth = 0, end = open;
    for (let i = open; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } } }
    const body = src.slice(open, end);
    for (const a of body.matchAll(/\.add\(\s*Attributes\.(\w+)\s*,\s*([^)]+)\)/g)) {
      const v = num(a[2].trim());
      attrs[a[1]] = Number.isNaN(v) ? { expr: a[2].trim() } : v;
    }
  }
  for (const a of src.matchAll(/getAttribute\(\s*Attributes\.(\w+)\s*\)\s*\.setBaseValue\(\s*([\d.]+)[dDfF]?\s*\)/g)) attrs[a[1]] = num(a[2]);
  const dropInfo = entityDrops(src, className);
  const own = {
    extends: ext,
    attributes: attrs,
    boss: /ServerBossEvent/.test(src) || parent?.boss || false,
    // heuristics: real taming/riding code mentions these many times; a stray reference does not count
    tameable: (src.match(/tame/gi) ?? []).length >= 5 || parent?.tameable || false,
    rideable: (src.match(/getControllingPassenger/g) ?? []).length >= 2 || parent?.rideable || false,
    drops: dropInfo.drops.length ? dropInfo.drops : parent?.drops ?? [],
    unparsedDrops: dropInfo.unparsed,
    extraDropCalls: [...src.matchAll(/\bspawnAtLocation\(([^;]*)\)/g)].map((x) => x[1].replace(/\s+/g, ' ').slice(0, 80)),
    hasLootDrops: dropInfo.drops.length > 0,
  };
  return own;
}

const entitiesRaw = [];
const entityRegistrations = [];
{
  const src = readText(path.join(javaRoot, 'entity/ModEntities.java'));
  const re = /ENTITY_TYPES\.register\(\s*"(\w+)"/g;
  const hits = [...src.matchAll(re)];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : src.indexOf('public static void register', m.index);
    const block = src.slice(m.index, end);
    const body = stripComments(block);
    const id = m[1];
    const cat = body.match(/MobCategory\.(\w+)/)?.[1] ?? null;
    const cls = body.match(/(\w+)::new/)?.[1] ?? null;
    const size = body.match(/\.sized\(\s*([\d.]+)[fF]?\s*,\s*([\d.]+)[fF]?\s*\)/);
    // doc comment sits above the `public static final` line, which precedes the register( call
    const declStart = src.lastIndexOf('public static final', m.index);
    entityRegistrations.push({
      id, cls, category: cat,
      width: size ? num(size[1]) : null, height: size ? num(size[2]) : null,
      fireImmune: /fireImmune\(\)/.test(body),
      devNote: precedingComment(src, declStart) || undefined,
    });
  });
}

const spawnEggFor = (id) => itemsRaw.find((i) => i.kind === 'spawn_egg' && (i.id === `${id}_spawnegg` || i.id === `${id}_spawn_egg`))?.id ?? null;
for (const reg of entityRegistrations) {
  if (reg.category === 'MISC') continue; // projectiles, beams, puddles, mirages: not mobs
  const cls = reg.cls ? extractEntityClass(reg.cls) : null;
  if (!cls) warn(`entity ${reg.id}: class ${reg.cls} not found in ${entityDir} (attributes/drops missing)`);
  const a = cls?.attributes ?? {};
  const val = (k) => (typeof a[k] === 'number' ? a[k] : null);
  const rules = (spawnRules[reg.id] ?? []).map((r) => ({
    biomes: flatBiomes(r.biomes).map((b) => ({ id: b.id, name: b.name, biome: b.biome ?? null, vanilla: !!b.vanilla })),
    weight: r.weight, min: r.min, max: r.max,
    viaTags: r.biomes.filter((b) => b.expands || (b.id.startsWith('#'))).map((b) => b.id),
  }));
  const extra = CONFIG.extraDrops[reg.id] ?? [];
  entitiesRaw.push({
    id: reg.id,
    name: nameOf('entity', reg.id) ?? prettify(reg.id),
    category: reg.category?.toLowerCase(),
    className: reg.cls,
    width: reg.width, height: reg.height,
    fireImmune: reg.fireImmune,
    boss: (cls?.boss ?? false) || CONFIG.extraBosses.includes(reg.id),
    tameable: cls?.tameable ?? false,
    rideable: cls?.rideable ?? false,
    health: val('MAX_HEALTH'),
    attackDamage: val('ATTACK_DAMAGE'),
    armor: val('ARMOR'),
    armorToughness: val('ARMOR_TOUGHNESS'),
    movementSpeed: val('MOVEMENT_SPEED'),
    flyingSpeed: val('FLYING_SPEED'),
    followRange: val('FOLLOW_RANGE'),
    knockbackResistance: val('KNOCKBACK_RESISTANCE'),
    attributesRaw: a,
    spawnEgg: spawnEggFor(reg.id),
    spawn: rules,
    drops: [...(cls?.drops ?? []), ...extra.map(({ source, ...d }) => ({ ...d, special: true }))],
    review: [
      ...(cls?.unparsedDrops?.length ? cls.unparsedDrops.map((u) => `drop not parsed: ${u}`) : []),
      ...(cls?.extraDropCalls?.length && !extra.length ? [`extra hard-coded drops (check): ${cls.extraDropCalls.join(' | ')}`] : []),
      ...(!cls ? ['class source missing'] : []),
      ...(cls && val('MAX_HEALTH') === null ? ['no MAX_HEALTH found'] : []),
    ],
    devNote: reg.devNote,
  });
}

// ---------------------------------------------------------------- biomes
const biomes = [];
for (const { id, file } of listJson(`data/${NS}/worldgen/biome`)) {
  const b = readJson(file);
  const hex = (n) => (typeof n === 'number' ? '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6) : null);
  const full = `${NS}:${id}`;
  const structures = [];
  const dir = 'data/' + NS + '/tags/worldgen/biome/has_structure';
  for (const t of listJson(dir)) {
    const vals = readJson(t.file).values ?? [];
    if (vals.includes(full)) structures.push(t.id);
  }
  const natives = entitiesRaw.filter((e) => e.spawn.some((r) => r.biomes.some((x) => x.id === full))).map((e) => e.id);
  biomes.push({
    id, name: nameOf('biome', id) ?? prettify(id),
    dimension: Object.keys(CONFIG.dimensions).find((d) => CONFIG.dimensions[d].biomes.includes(id)) ?? null,
    temperature: b.temperature, downfall: b.downfall, precipitation: !!b.has_precipitation,
    colors: { sky: hex(b.effects?.sky_color), fog: hex(b.effects?.fog_color), water: hex(b.effects?.water_color), grass: hex(b.effects?.grass_color), foliage: hex(b.effects?.foliage_color) },
    clouds: !b.effects?.disable_clouds,
    carvers: Object.values(b.carvers ?? {}).flat().map(stripNs),
    structures: structures.map((s) => ({ id: s, name: CONFIG.structureNames[s] ?? prettify(s) })),
    mobs: natives,
    since: undefined,
  });
}

// ---------------------------------------------------------------- assemble final records
const prevItems = previous('items.json'), prevBlocks = previous('blocks.json'), prevMobs = previous('mobs.json'), prevBiomes = previous('biomes.json');
const slug = (id) => CONFIG.slugOverrides[id] ?? id.replace(/_+/g, '_');

const itemIds = new Set(itemsRaw.map((i) => i.id));
const blockIds = new Set(blocksRaw.map((b) => b.id));
const mobIds = new Set(entitiesRaw.map((e) => e.id));

const dropsFromMobs = {}; // item id -> [mob ids]
for (const e of entitiesRaw) for (const d of e.drops) for (const it of [...d.items, d.cooked].filter(Boolean)) (dropsFromMobs[it] ??= new Set()).add(e.id);

const items = itemsRaw.filter((i) => i.kind !== 'spawn_egg' && included('items', i.id)).map((i) => {
  const full = `${NS}:${i.id}`;
  const out = {
    id: i.id, slug: slug(i.id), name: nameOf('item', i.id) ?? (warn(`item ${i.id}: no lang name`), prettify(i.id)),
    kind: i.kind, since: sinceFor(prevItems, i.id),
    rarity: i.rarity, stackSize: i.stackSize, durability: i.durability, fireResistant: i.fireResistant,
    tier: i.tier, attackDamage: i.attackDamage, attackSpeed: i.attackSpeed, miningSpeed: i.miningSpeed, enchantability: i.enchantability,
    customStats: i.customStats, armor: i.armor, food: i.food,
    tooltip: Object.entries(lang).filter(([k]) => k.startsWith(`item.${NS}.${i.id}.`) && /tooltip|desc/.test(k)).map(([, v]) => v),
    recipes: recipesByResult[full] ?? [],
    usedIn: [...(usedIn[full] ?? [])],
    droppedBy: [...(dropsFromMobs[full] ?? [])].filter((m) => mobIds.has(m)),
    foundIn: [...(chestItems[full] ?? [])],
    obtainedFromBlocks: Object.entries(blockDrops).filter(([, d]) => d.some((x) => x.item === full)).map(([b]) => b).filter((b) => b !== i.id),
    ...(CONFIG.customItemStats?.[i.id] ?? {}),   // hand-verified stats for items whose numbers are set in custom Java code
  };
  return stripUndefined(out);
});
const blocks = blocksRaw.filter((b) => included('blocks', b.id)).map((b) => {
  const full = `${NS}:${b.id}`;
  return stripUndefined({
    id: b.id, slug: slug(b.id), name: nameOf('block', b.id) ?? (warn(`block ${b.id}: no lang name`), prettify(b.id)),
    group: b.group, since: sinceFor(prevBlocks, b.id),
    hardness: b.hardness, blastResistance: b.blastResistance, lightLevel: b.lightLevel, requiresTool: b.requiresTool, xp: b.xp, sound: b.sound,
    hasItem: b.hasItem,
    drops: blockDrops[b.id] ?? [],
    recipes: recipesByResult[full] ?? [],
    usedIn: [...(usedIn[full] ?? [])],
    foundIn: [...(chestItems[full] ?? [])],
  });
});
const mobs = entitiesRaw.filter((e) => included('mobs', e.id)).map(({ devNote, ...e }) => stripUndefined({ ...e, since: sinceFor(prevMobs, e.id) })); // developer comments are never published
const biomesOut = biomes.filter((b) => included('biomes', b.id)).map((b) => stripUndefined({ ...b, since: sinceFor(prevBiomes, b.id) }));

function stripUndefined(o) { return JSON.parse(JSON.stringify(o)); }

// names for any id mentioned in recipes/drops (internal + vanilla)
const names = {};
for (const i of itemsRaw) names[`${NS}:${i.id}`] = nameOf('item', i.id) ?? prettify(i.id);
for (const b of blocksRaw) names[`${NS}:${b.id}`] = nameOf('block', b.id) ?? prettify(b.id);
const linkIndex = {};
for (const i of items) linkIndex[`${NS}:${i.id}`] = `items/${i.slug}`;
for (const b of blocks) linkIndex[`${NS}:${b.id}`] = `blocks/${b.slug}`;

// ---------------------------------------------------------------- consistency report
for (const k of Object.keys(lang)) {
  const m = k.match(/^(item|block)\.prolinsuniverse\.([a-z0-9_]+)$/);
  if (!m) continue;
  const set = m[1] === 'item' ? itemIds : blockIds;
  if (!set.has(m[2]) && !(m[1] === 'item' && blockIds.has(m[2]))) warn(`lang key without registration: ${k}`);
}
for (const e of entitiesRaw) for (const r of e.review) warn(`${e.id}: ${r}`);

writeJson('mobs.json', mobs);
writeJson('items.json', items);
writeJson('blocks.json', blocks);
writeJson('biomes.json', biomesOut);
writeJson('recipes.json', recipes);
writeJson('loot-sources.json', lootSources);
writeJson('names.json', { names, links: linkIndex });

// ---------------------------------------------------------------- manifest / checklist
const manifestOut = { version: CURRENT, approved: manifest.approved ?? false, exclude: manifest.exclude ?? [] };
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifestOut, null, 2) + '\n');

const groups = {
  Mobs: mobs.map((m) => `mobs:${m.id}  (${m.name}${m.boss ? ', boss' : ''})`),
  Biomes: biomesOut.map((b) => `biomes:${b.id}  (${b.name})`),
};
for (const k of ['weapon', 'tool', 'armor', 'material', 'food', 'misc']) groups[`Items: ${k}`] = items.filter((i) => i.kind === k).map((i) => `items:${i.id}  (${i.name})`);
for (const k of ['ore', 'metal', 'natural', 'wood', 'functional', 'other']) groups[`Blocks: ${k}`] = blocks.filter((b) => b.group === k).map((b) => `blocks:${b.id}  (${b.name})`);
const skipped = [
  ...itemsRaw.filter((i) => i.kind === 'spawn_egg').map((i) => `items:${i.id}  (spawn egg, shown on the mob page instead)`),
  ...entitiesRaw.length ? [] : [],
];
let md = `# Content checklist for v${CURRENT}\n\nEverything below is registered in the mod source and is documented on the wiki.\nTo leave something OUT, add its id (e.g. \`items:ruby\`) to the \`exclude\` list in \`src/data/manifests/${CURRENT}.json\` and run \`npm run gen\` again.\n\nStatus: **${manifestOut.approved ? 'approved' : 'NOT YET APPROVED'}**\n`;
for (const [g, list] of Object.entries(groups)) md += `\n## ${g} (${list.length})\n\n${list.map((x) => `- [x] \`${x.split('  ')[0]}\`  ${x.split('  ').slice(1).join(' ')}`).join('\n')}\n`;
md += `\n## Not given their own page\n\n${skipped.map((x) => `- ${x}`).join('\n')}\n`;
fs.writeFileSync(path.join(ROOT, `CHECKLIST-${CURRENT}.md`), md);

console.log(`mobs ${mobs.length}  items ${items.length}  blocks ${blocks.length}  biomes ${biomesOut.length}  recipes ${recipes.length}  chest tables ${lootSources.length}`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  - ' + w);
}

// ---------------------------------------------------------------- scaffold missing mob pages (never overwrites)
if (!args['no-scaffold']) {
  const { scaffold } = await import('./scaffold.mjs');
  scaffold({ root: ROOT, mobs, current: CURRENT });
}
