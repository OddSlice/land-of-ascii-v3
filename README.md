# Land of Ascii v3

A text-rendered explorer, rebuilt from the ground up. Every frame is a grid of monospace cells, each one glyph on a coloured background.

**Phase 0a, the Look Lab:** one small, fixed valley (meadow, lake, conifers, a stone wall with a gate, a snowy ridge) at day, dusk and night, built to prove the look before any world is built.

**Phase 0b:** water that reflects and refracts, with ripples, and a 2 km stress scene (`?stress=1` or X) that measures the renderer. Verdict: the CPU backend stays, with density 3 as the default.

**Phase 0c, the look pass:** three fixes (far torches, far treelines, the forest interior) and candidate treatments for conifers, clouds, the meadow and the shallows, chosen live in a look panel (L). The first draft of the art bible: [docs/art-bible.md](docs/art-bible.md).

- Play: https://oddslice.github.io/land-of-ascii-v3/ (the stress scene: https://oddslice.github.io/land-of-ascii-v3/?stress=1; the recommended look: https://oddslice.github.io/land-of-ascii-v3/?tree=B&cloud=B&meadow=2&shallows=blue)
- How it works, how it compares with the reference, frame times: [docs/phase0a.md](docs/phase0a.md), [docs/phase0b.md](docs/phase0b.md), [docs/phase0c.md](docs/phase0c.md)

```sh
npm install
npm run dev      # http://localhost:5190/
npm run build    # the single-file index.html
```

Keys: WASD walk (Shift runs) · click or drag to look · 1 2 3 day, dusk, night · T time runs · C cameras · G glyphs off/on · R reference (local copies only) · − + density · X stress scene · L look panel (7 8 9 0 cycle its choices) · H HUD.

Vanilla JavaScript in ES modules. The scene is marched on the CPU in module workers, and the cells are drawn with WebGL2 in one call. No runtime dependencies.
