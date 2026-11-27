// Hand-maintained knowledge the mod's JSON/Java can't tell us. Edit freely.

export const CONFIG = {
  // Page URL for ids whose internal registry name is ugly.
  slugOverrides: {
    test_fluid_block: 'ichor',
    test_fluid_bucket: 'ichor_bucket',
  },

  // Chest loot table id -> readable name (anything missing falls back to a prettified id).
  lootTableNames: {
    broken_vein_tier1: 'Broken Vein dungeon chest (tier 1)',
    broken_vein_tier2: 'Broken Vein dungeon chest (tier 2)',
    broken_vein_tier3: 'Broken Vein dungeon chest (tier 3)',
    skarn_dungeon_island: 'Skarn Dungeon Island chest',
    werebear_den: 'Werebear Den chest',
    xerion_dungeon_room_1_loot: 'Xerion Dungeon chest (room 1)',
    xerion_dungeon_room_2_loot: 'Xerion Dungeon chest (room 2)',
    xerion_dungeon_room_3_loot: 'Xerion Dungeon chest (room 3)',
    xerion_dungeon_room_final_1_loot: 'Xerion Dungeon chest (final room)',
    xerion_dungeon_room_final_2_loot: 'Xerion Dungeon chest (final room)',
    xerion_dungeon_room_final_3_loot: 'Xerion Dungeon chest (final room)',
    xerion_dungeon_room_final_4_loot: 'Xerion Dungeon chest (final room)',
  },

  // has_structure/<id> tag -> structure display name
  structureNames: {
    ender_sanctum: 'Ender Sanctum',
    scither_burrow: 'Scither Burrow',
    skarn_dungeon_island: 'Skarn Dungeon Island',
    werebear_den: 'Werebear Den',
    xerion_dungeon: 'Xerion Dungeon',
  },

  // Dimensions and which of our biomes they contain (from data/<ns>/dimension/*.json).
  dimensions: {
    'Broken Vein': { biomes: ['ichor_ocean', 'broken_vein_biome', 'fractured_spine_biome', 'the_bleeding_grove'] },
  },

  // Vanilla tag / biome ids -> text for the spawn table.
  vanillaTagNames: {
    'minecraft:is_forest': 'Forest biomes',
    'minecraft:is_taiga': 'Taiga biomes',
    'minecraft:is_nether': 'Nether (all biomes)',
    'minecraft:is_beach': 'Beaches',
    'minecraft:is_ocean': 'Oceans',
  },
  vanillaBiomeNames: {
    'minecraft:stony_shore': 'Stony Shore',
  },

  // Draft tier = bucket of max health. It only seeds the frontmatter of NEW mob pages; you own the value afterwards.
  tierFor(health, boss) {
    if (boss) return 4;
    if (health === null || health === undefined) return 1;
    if (health >= 150) return 4;
    if (health >= 60) return 3;
    if (health >= 25) return 2;
    return 1;
  },

  // Mobs shown under "Bosses" rather than "Mobs". Detected automatically (boss bar in the class);
  // add ids here for fights that have no boss bar.
  extraBosses: ['storm_caller'],

  // Stats that are set in custom Java (not readable from ModItems), verified by hand against the source.
  // Hecatomb: ModHecatombSword -> DAMAGE_BONUS 285 (+1 base = 286), SPEED_MODIFIER -2.3 (4-2.3 = 1.7/s), REACH_BONUS 5, SHARPNESS_LEVEL 6.
  customItemStats: {
    hecatomb: {
      attackDamage: 286,
      attackSpeed: 1.7,
      reach: 5,
      alwaysEnchanted: 'Sharpness VI',
    },
  },

  // Drops that are hard-coded in Java (spawnAtLocation) instead of going through ModEntityDrops/loot tables.
  // Verified by hand against the entity classes. `note` is shown next to the drop on the mob page.
  extraDrops: {
    scither: [
      { items: ['prolinsuniverse:scither_normal_skin', 'prolinsuniverse:scither_brown_skin', 'prolinsuniverse:scither_purple_skin', 'prolinsuniverse:scither_red_skin'], min: 1, max: 1, chance: 1, note: "Always drops the skin matching its own colour (normal, brown, purple or red)." },
    ],
    scither_brood_mother: [
      { items: ['prolinsuniverse:scither_normal_skin', 'prolinsuniverse:scither_brown_skin', 'prolinsuniverse:scither_purple_skin', 'prolinsuniverse:scither_red_skin'], min: 2, max: 3, chance: 1, note: "Always drops 2-3 skins of its own colour." },
    ],
    carcinyx: [
      { items: ['prolinsuniverse:hecatomb_handle', 'prolinsuniverse:hecatomb_guard', 'prolinsuniverse:hecatomb_blade'], min: 1, max: 1, chance: 0.006, chanceText: 'Golden giant only', oneOf: true, note: "Only the very rare golden Carcinyx (about 0.6% of giant spawns) drops one Hecatomb part." },
    ],
  },
};
