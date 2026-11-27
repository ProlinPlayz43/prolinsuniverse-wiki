import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

// Starlight's own frontmatter plus two wiki fields:
//   since  - the mod version that introduced the page (the build refuses anything newer than versions.json "current")
//   mob    - hand-written facts for mob/boss pages; everything else is read from the generated data
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        since: z.string().optional(),
        mob: z
          .object({
            id: z.string(),
            tier: z.number().int().min(1).max(5).optional(),
            summary: z.string().optional(),
            // optional overrides of values read from the mod source
            health: z.number().optional(),
            attackDamage: z.number().optional(),
            armor: z.number().optional(),
            movementSpeed: z.number().optional(),
            spawnText: z.string().optional(),
            // extra rows for the infobox, e.g. [{ label: "Weakness", value: "Fire" }]
            extra: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
          })
          .optional(),
      }),
    }),
  }),
};
