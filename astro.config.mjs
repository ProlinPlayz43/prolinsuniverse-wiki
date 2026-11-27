// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// The site is served from https://prolinplayz43.github.io/prolinsuniverse-wiki/
// If you rename the repo or move to a custom domain, change `site` and `base` here (and nothing else).
export default defineConfig({
  site: 'https://prolinplayz43.github.io',
  base: '/prolinsuniverse-wiki',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Prolins Universe Wiki',
      description: 'Unofficial reference for the Prolins Universe NeoForge mod: mobs, bosses, items, blocks and biomes.',
      customCss: ['./src/styles/wiki.css'],
      components: {
        Banner: './src/components/Banner.astro',
      },
      lastUpdated: false,
      pagination: false,
      sidebar: [
        { label: 'Mobs', collapsed: true, items: [{ autogenerate: { directory: 'mobs' } }] },
        { label: 'Bosses', collapsed: true, items: [{ autogenerate: { directory: 'bosses' } }] },
        { label: 'Items', link: '/items/' },
        { label: 'Blocks', link: '/blocks/' },
        { label: 'Biomes', link: '/biomes/' },
        { label: 'Changelog', link: '/changelog/' },
      ],
    }),
  ],
});
