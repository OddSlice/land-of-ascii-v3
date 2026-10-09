# Land of Ascii v3

A text-rendered explorer, rebuilt from the ground up. Every frame is a grid of monospace cells, each one glyph on a coloured background.

**Phase 0a, the Look Lab:** one small, fixed valley (meadow, lake, conifers, a stone wall with a gate, a snowy ridge) at day, dusk and night, built to prove the look before any world is built.

- Play: https://oddslice.github.io/land-of-ascii-v3/
- How it works, how it compares with the reference, frame times: [docs/phase0a.md](docs/phase0a.md)

```sh
npm install
npm run dev      # http://localhost:5190/
npm run build    # the single-file index.html
```

Keys: WASD walk (Shift runs) · click or drag to look · 1 2 3 day, dusk, night · T time runs · C cameras · G glyphs off/on · R reference (local copies only) · − + density · H HUD.

Vanilla JavaScript in ES modules. The scene is marched on the CPU in module workers, and the cells are drawn with WebGL2 in one call. No runtime dependencies.
