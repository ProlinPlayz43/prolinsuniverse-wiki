// Merges the generated facts for a mob with the hand-written frontmatter block on its page.
import { mobById } from './data';

export interface MobFm {
  id: string;
  tier?: number;
  summary?: string;
  health?: number;
  attackDamage?: number;
  armor?: number;
  movementSpeed?: number;
  spawnText?: string;
  extra?: { label: string; value: string }[];
}

export function resolveMob(fm: MobFm) {
  const base = mobById(fm.id);
  // Fail the build loudly if a page points at an id that doesn't exist in the data (typo, or removed from the mod).
  if (!base) throw new Error(`mob page references unknown mob id "${fm.id}". Run "npm run gen" or fix mob.id.`);
  const o: Record<string, unknown> = {};
  for (const k of ['health', 'attackDamage', 'armor', 'movementSpeed'] as const) if (fm[k] !== undefined) o[k] = fm[k];
  return { ...base, ...o, tier: fm.tier, summary: fm.summary, spawnText: fm.spawnText, extra: fm.extra ?? [] } as any;
}
