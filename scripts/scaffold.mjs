// Creates a page stub for every mob in the generated data that doesn't have one yet.
// NEVER overwrites an existing page: your hand-written frontmatter and prose are safe.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';

export function scaffold({ root, mobs, current }) {
  const created = [];
  for (const m of mobs) {
    const isBoss = m.boss || CONFIG.extraBosses.includes(m.id);
    const dir = isBoss ? 'bosses' : 'mobs';
    const other = isBoss ? 'mobs' : 'bosses';
    const file = path.join(root, 'src/content/docs', dir, `${m.id}.mdx`);
    const otherFile = path.join(root, 'src/content/docs', other, `${m.id}.mdx`);
    if (fs.existsSync(file) || fs.existsSync(otherFile)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tier = CONFIG.tierFor(m.health, isBoss);
    fs.writeFileSync(file, `---
title: ${JSON.stringify(m.name)}
description: ${JSON.stringify(`${m.name} in Prolins Universe: health, drops, spawn locations and behaviour.`)}
since: "${m.since ?? current}"
mob:
  id: ${m.id}
  # --- hand-written: review these ---------------------------------------------
  tier: ${tier}            # draft value seeded from max health; you decide the real tier
  summary: ""            # one line shown in the mob list
  # --- optional overrides (otherwise read from the mod source) -----------------
  # health: 20
  # spawnText: "Shown instead of the spawn table, e.g. 'Summoned at the Storm Caller altar'"
---
import MobInfobox from '../../../components/MobInfobox.astro';
import SpawnTable from '../../../components/SpawnTable.astro';
import DropsTable from '../../../components/DropsTable.astro';

<MobInfobox mob={frontmatter.mob} title={frontmatter.title} />

{/*
  Write the ${m.name} page here. Delete this comment and add sections, for example:

  ## Overview
  What it looks like, where players meet it, why it matters.

  ## Behaviour
  Attacks, phases, weaknesses and tips.

  Until you add prose, the page simply shows the infobox, spawn table and drops.
*/}

## Spawning

<SpawnTable mob={frontmatter.mob} />

## Drops

<DropsTable mob={frontmatter.mob} />
`);
    created.push(path.relative(root, file));
  }
  if (created.length) {
    console.log(`\nscaffolded ${created.length} new mob page(s):`);
    for (const c of created) console.log('  + ' + c);
  }
  return created;
}
