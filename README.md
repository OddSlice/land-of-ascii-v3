# Land of Ascii v3

A text-rendered explorer, rebuilt from the ground up. Every frame is a grid of monospace cells, each one glyph on a coloured background.

**Phase 0a, the Look Lab:** one small, fixed valley (meadow, lake, conifers, a stone wall with a gate, a snowy ridge) at day, dusk and night, built to prove the look before any world is built.

**Phase 0b:** water that reflects and refracts, with ripples, and a 2 km stress scene (`?stress=1` or X) that measures the renderer. Verdict: the CPU backend stays, with density 3 as the default.

**Phase 0c, the look pass:** three fixes (far torches, far treelines, the forest interior) and candidate treatments for conifers, clouds, the meadow and the shallows, chosen live in a look panel (L). The art bible: [docs/art-bible.md](docs/art-bible.md).

**Phase 1, the world:** a 2 km land generated from a seed, with lowland, lakes, rivers, forest stands, roads, mountains to the north and east and the sea to the south and west. Built in its own worker; on Vercel the workers share one copy of it. The look is locked (conifers B, clouds B, meadow 2, blue shallows). The scale it is built to: [docs/scale.md](docs/scale.md).

**Phase 2a, air and far land:** aerial perspective that thins with height, so distance stays readable; far mountains with lit faces, shaded flanks, gullies and snow, and a backdrop range past the north and east edges; the moon's phases, moonlit and starlit nights, and a dawn of its own; a coast with a wet band, a foam line and a swell; copses in the open lowland; viewpoints at the brows of their hills. Each new rule can be switched back to phase 1's in the look panel (5 and 6).

**Phase 2b, weather and the menu:** weather from a forecast that is a pure function of the seed, the day and the hour (clear, fair, overcast, rain and a morning mist that pools in the hollows and over the lakes, burning off as the sun climbs); rain streaks, rings on water and wet ground that dries; a menu on Escape with every control and option (since laid out as tabs with icons, with the frame rate and a few statistics on screen by default, and big screens drawn at the same cost as a 1440 × 900 window); five look fixes (a dark silhouette for the far range at dusk, warm far rock, no snow line along the crests, no specks in the dawn sky, a lake's wet band that follows its shore and a better coast camera).

- Play: https://land-of-ascii-v3.vercel.app/ (shared memory). Also https://oddslice.github.io/land-of-ascii-v3/ (each worker its own copy, at most 4 workers).
- A seed: `?seed=N` (the default is 3). The moon: `?day=N` (0 a bright moon, 15 a dark one). The lab: `?lab=1`. The stress scene: `?stress=1`.
- How it works and what it measures: [docs/phase0a.md](docs/phase0a.md), [docs/phase0b.md](docs/phase0b.md), [docs/phase0c.md](docs/phase0c.md), [docs/phase1.md](docs/phase1.md), [docs/phase2a.md](docs/phase2a.md), [docs/phase2b.md](docs/phase2b.md)

```sh
npm install
npm run dev      # http://localhost:5190/ (cross-origin isolated; NOISO=1 for without)
npm run build    # the single-file index.html
```

Esc opens the menu: every key explained, the display options (kept in the browser), the world (seed, time, weather) and the comparison tools of earlier phases, each a tab. Keys in the world: WASD walk (Shift runs) · F fly (Space climbs) · M map · R new world · click or drag to look · 1 2 3 4 day, dusk, night, dawn · T time runs · C cameras · G glyphs off/on · − + density · L look panel (7 8 9 0 5 6 cycle its choices) · H statistics. In the lab and the stress scene, R shows the reference (local copies only) and X switches between them.

Vanilla JavaScript in ES modules. The scene is marched on the CPU in module workers, and the cells are drawn with WebGL2 in one call. No runtime dependencies.
