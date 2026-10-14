# Land of Ascii v3

A text-rendered explorer, rebuilt from the ground up. Every frame is a grid of monospace cells, each one glyph on a coloured background.

**Phase 0a, the Look Lab:** one small, fixed valley (meadow, lake, conifers, a stone wall with a gate, a snowy ridge) at day, dusk and night, built to prove the look before any world is built.

**Phase 0b:** water that reflects and refracts, with ripples, and a 2 km stress scene (`?stress=1` or X) that measures the renderer. Verdict: the CPU backend stays, with density 3 as the default.

**Phase 0c, the look pass:** three fixes (far torches, far treelines, the forest interior) and candidate treatments for conifers, clouds, the meadow and the shallows, chosen live in a look panel (L). The art bible: [docs/art-bible.md](docs/art-bible.md).

**Phase 1, the world:** a 2 km land generated from a seed, with lowland, lakes, rivers, forest stands, roads, mountains to the north and east and the sea to the south and west. Built in its own worker; on Vercel the workers share one copy of it. The look is locked (conifers B, clouds B, meadow 2, blue shallows; since phase 3a the conifers are the tidy tiers, A, with no choice left). The scale it is built to: [docs/scale.md](docs/scale.md).

**Phase 2a, air and far land:** aerial perspective that thins with height, so distance stays readable; far mountains with lit faces, shaded flanks, gullies and snow, and a backdrop range past the north and east edges; the moon's phases, moonlit and starlit nights, and a dawn of its own; a coast with a wet band, a foam line and a swell; copses in the open lowland; viewpoints at the brows of their hills. Each new rule can be switched back to phase 1's in the look panel (5 and 6).

**Phase 2b, weather and the menu:** weather from a forecast that is a pure function of the seed, the day and the hour (clear, fair, overcast, rain and a morning mist that pools in the hollows and over the lakes, burning off as the sun climbs); rain streaks, rings on water and wet ground that dries; a menu on Escape with every control and option (since laid out as tabs with icons, with the frame rate and a few statistics on screen by default, and big screens drawn at the same cost as a 1440 × 900 window); five look fixes (a dark silhouette for the far range at dusk, warm far rock, no snow line along the crests, no specks in the dawn sky, a lake's wet band that follows its shore and a better coast camera).

**Phase 3a, the building kit and the fort:** a kit of building pieces as data (curtain wall with its walk and crenellations, an arched gate passage, square and round towers with stairs inside, a keep with its hall, stairs to the walk, a timber house, a well, torches, lit windows), built from exact shapes that stand at any angle; the same shapes are drawn, cast shadows and are walked on. A fort built from it on every seed, on its rise by the lake and seen from the spawn: the road runs into its gate, and you can walk through the passage, round the courtyard, up onto the walls, into the towers and the keep; at night its torches and windows are lit. Every piece stands alone in the building yard (`?yard=1`).

**After phase 3a:** the fort's stone has its own paler colour and dark course joints that show from further off; Space jumps (about 1.1 m: onto a parapet's breastwork, out through a crenel) and you can step off the wall walk; walking up stairs no longer stutters; the well is a dark hole; the clock runs in real time from the start; the conifers are the tidy tiers only; and Chromium is asked for the mouse's raw movement, so a fast flick no longer makes the view skip.

**Phase 3b, villages and bridges:** three villages on every seed, each composed from the land and never stamped (one strung along its road, one round a green with its well and market shelter, one on the shore with a jetty): cottages and larger houses with thatch or shingle roofs on stone footings, a chapel, a well, barns at the edge, lanterns and lit windows at night, a signpost where its road meets the main road, and a few houses you can go into (a hearth that glows at night, a table, a bed, a shelf). Fields in strips round them with fences, dry-stone walls and gate gaps, footpaths to the fields, the water and the nearest viewpoint, and bridges where the main roads cross rivers (timber over narrow crossings, stone with arches over wide ones). The fort's road now winds up to its gate, its passage torches are dimmer, its yard has a worn path, and its hall and one tower room are furnished. The menu has a benchmark (Advanced).

**Phases 4a to 5b:**
- **People and animals (4a, 4b):** villagers, the fort's watch and travellers, with flocks, herds, hens, dogs, deer and birds, all living by the clock.
- **Wayfaring (5a):** the map fills in as you go; a journal (J) of places, people and sketches (K); villagers' favours, with standing and a lantern (L); progress kept for each world. The rules are in [docs/design.md](docs/design.md).
- **Sound and polish (5b):** the land's sound, all made in code: wind, rain, water, birds and beasts, your footsteps, fires, wells, the chapel's bell and doors. It starts with your first click, N turns it off, and the menu has a Sound section. Also a round of fixes from the earlier phases.
- The version is shown in the menu.

- Play: https://land-of-ascii-v3.vercel.app/ (shared memory). Also https://oddslice.github.io/land-of-ascii-v3/ (each worker its own copy, at most 4 workers).
- A seed: `?seed=N` (the default is 3). The moon: `?day=N` (0 a bright moon, 15 a dark one). The lab: `?lab=1`. The stress scene: `?stress=1`. The building yard: `?yard=1` (since phase 3b with the village pieces too; the prototypes the kit was chosen by were removed).
- How it works and what it measures: [docs/phase0a.md](docs/phase0a.md), [docs/phase0b.md](docs/phase0b.md), [docs/phase0c.md](docs/phase0c.md), [docs/phase1.md](docs/phase1.md), [docs/phase2a.md](docs/phase2a.md), [docs/phase2b.md](docs/phase2b.md), [docs/phase3a.md](docs/phase3a.md), [docs/phase3b.md](docs/phase3b.md), [docs/phase4a.md](docs/phase4a.md), [docs/phase4b.md](docs/phase4b.md), [docs/phase5a.md](docs/phase5a.md), [docs/phase5b.md](docs/phase5b.md)

```sh
npm install
npm run dev      # http://localhost:5190/ (cross-origin isolated; NOISO=1 for without)
npm run build    # the single-file index.html
```

Esc opens the menu: every key explained, the display and sound options (kept in the browser), the world (seed, time, weather, your progress) and the comparison tools of earlier phases, each a tab. Keys in the world: WASD walk (Shift runs) · Space jump · E greet · J journal · K sketch · L lantern · F fly (Space climbs) · M map · N sound on/off · R new world · click or drag to look · 1 2 3 4 day, dusk, night, dawn · T time stops or runs (it runs in real time from the start) · C cameras · G glyphs off/on · − + density · Shift L look panel (8 9 0 5 6 cycle its choices) · H statistics. In the lab and the stress scene, R shows the reference (local copies only) and X switches between them.

Vanilla JavaScript in ES modules. The scene is marched on the CPU in module workers, and the cells are drawn with WebGL2 in one call. No runtime dependencies.
