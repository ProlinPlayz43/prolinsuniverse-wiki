# Prolins Universe Wiki

Unofficial wiki for the **Prolins Universe** NeoForge mod. It documents **one version at a time** (currently the version in
`src/data/versions.json` → `current`). Built with [Astro Starlight](https://starlight.astro.build) and deployed to GitHub Pages.

Live site: https://prolinplayz43.github.io/prolinsuniverse-wiki/

The mod's source code is private and is **not** in this repo. Facts are extracted from it by a script and the result is committed
as plain JSON under `src/data/generated/`, so the public build never needs the source.

## Add a new mob (the usual job)

1. In the mod, register the mob as usual (entity, attributes, drops, spawn modifier, lang name).
2. In this repo run: `npm run gen -- --mod "D:\path\to\ProlinUniverse"`
   (add `--entities "<folder of entity classes>"` if the entity classes live outside `src/main/java/.../entity`).
   This refreshes `src/data/generated/*` and creates a stub page `src/content/docs/mobs/<id>.mdx` (or `bosses/`) for every mob that has none.
   It never overwrites a page you already edited.
3. Open the new page and fill in the frontmatter:
   ```yaml
   mob:
     id: gecko          # must match the registry id
     tier: 1            # 1-5, your call
     summary: "A small, skittish lizard."
     # optional: health / attackDamage / armor / movementSpeed overrides, spawnText, extra rows
   ```
   Write any prose below the infobox. Health, drops and spawn biomes fill themselves in from the mod.
4. Add an image at `src/assets/images/mobs/<id>.png` (see below). Optional but recommended.
5. `npm run dev` to preview, then commit and push. The site redeploys automatically.

If a mob has no natural biome spawn (summoned, structure-only, boss arena), set `spawnText` in its frontmatter.

## Items, blocks and biomes

They are generated pages (nothing to write). To add a description to an item or block, add a line to `src/data/descriptions.json`.
To hide something from the wiki, add its id (e.g. `items:ruby`) to `exclude` in `src/data/manifests/<version>.json` and re-run `npm run gen`.

## Images

`npm run images` writes `IMAGES_NEEDED.md` listing what is missing. Drop files at
`src/assets/images/<mobs|bosses|items|blocks|biomes>/<id>.png` (png, jpg, webp or gif). No code change needed;
until a file exists a "No image yet" placeholder is shown.

## Documenting a new version

1. Bump `current` in `src/data/versions.json` and add the version to its `versions` list.
2. `npm run gen -- --mod "<path>"`. New content gets `since: "<new version>"`, existing content keeps its old `since`.
3. Review `CHECKLIST-<version>.md`, then set `"approved": true` in `src/data/manifests/<version>.json`.
4. Add notes to `src/data/changelog.json`.

## Safety rail

`npm run build` runs `scripts/check.mjs` first and **fails** (so nothing deploys) if the manifest is not approved, if any page or
entry is newer than `current`, or if the changelog lists a future version. This keeps unreleased content off the public site.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local preview at http://localhost:4321/prolinsuniverse-wiki/ |
| `npm run build` | Check + production build into `dist/` |
| `npm run gen -- --mod <path>` | Re-extract data from the mod source |
| `npm run images` | List missing images |
