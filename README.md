# Land of Ascii

A quiet walk through a land drawn in letters, in the browser. Every frame is a grid of monospace cells, each one glyph in an ink colour on a background colour. The picture is made by marching rays on the CPU in web workers and drawn with WebGL2 in one call. The land is generated from a seed: hills, rivers, a fort, three villages, their people and animals, the weather, day and night. You walk it, greet the villagers, do them small favours, sketch the views and find your way by the signposts. Its sound and music are made in code.

This is the third build of the game, hence the repository's name; the game is called Land of Ascii everywhere a player looks.

- **Front page:** https://land-of-ascii-v3.vercel.app/
- **The game:** https://land-of-ascii-v3.vercel.app/play.html. On Vercel the workers share one copy of the world.
- **The same on GitHub Pages:** https://oddslice.github.io/land-of-ascii-v3/ (without shared memory, so at most four workers).
- **Version:** 0.6.5. The history is in [CHANGELOG.md](CHANGELOG.md).

## Run it

```sh
npm install            # esbuild and Playwright, for the build and the tools
npm run dev            # http://localhost:5190/ is the game from the sources
```

`NOISO=1 npm run dev` serves without cross-origin isolation, as GitHub Pages does. Then each worker holds its own copy of the world.

URL options on `play.html`:

| Option | What it does |
|---|---|
| `?seed=N` | another world (the default seed is 3) |
| `&at=x,z,yaw&hour=h` | a place and an hour, as Share this world makes them |
| `?day=N` | the day count, which the moon follows (0 a bright moon, 15 a dark one) |
| `?density=1..4` | the detail level |
| `?threads=N` | the number of render workers (0: everything on the page) |
| `?lab=1`, `?stress=1`, `?yard=1` | the tools' scenes: the Look Lab, the stress scene, the building yard |

Keys: WASD walk, the mouse (or the arrows) looks, E greets, J opens the journal, K sketches, M shows the map, N turns the sound off, Esc opens the menu with everything else. The player's keys can be changed in the menu (Controls).

## Build and deploy

```sh
npm run build          # play.html (the game, one file) and index.html (the front page)
node tools/front.mjs   # the front page's pictures, made by the game (src/front/data.json); --og the share image
```

The built `play.html` and `index.html` are committed, so build before committing. Pushing `main` publishes the repository's root on Vercel (`vercel.json`: the isolation headers, and redirects for old links) and on GitHub Pages. `.vercelignore` keeps `reference/` and `shots/` off Vercel. The version is `package.json`'s; raise it with each release.

## Test it

Every check runs from the command line, in Node or in Playwright's Chromium, Firefox and WebKit:

| Command | What it checks |
|---|---|
| `node tools/world-check.mjs` | five seeds: the land, the roads and rivers, the sky test, the fort and the villages walked, people, animals, favours played from their words (`--fort-only --sweep 60`: sixty seeds) |
| `node tools/identity.mjs --scene all --built` | every number of workers draws the same cells |
| `node tools/lookbook.mjs --regress --built` | the fixed cameras of every scene against the saved set (`tools/regress/`), cell for cell |
| `node tools/flicker.mjs --people` (`--animals`, `--buildings`, `--skyline`, `--set world`) | blinking cells while walking and turning |
| `node tools/menu-check.mjs` | the menu, the title screen, the keys and the settings, by keyboard and mouse |
| `node tools/progress-check.mjs --built --browser chromium` (or `firefox`, `webkit`) | saved progress, backups, no storage |
| `node tools/sound-check.mjs --built` | the sound at every kind of source: nothing clips, the voices are held |
| `node tools/audit.mjs` | what the others don't cover: resizing, switching detail, opening from disk, the Pages copy, a cold load, a month of game time, moved keys, the menu by keyboard, the largest text, broken storage, edited backups |
| `node tools/bench.mjs --scene world --built --threads 8 --density 3` | frame times on every fixed camera (on a quiet machine) |

How these tools share their pages is in [docs/architecture.md](docs/architecture.md), and what each other tool in `tools/` does is in its first lines.

## Promo

The trailer, the hype images and the itch.io page set are in `promo/` (see `promo/README.txt`), made from the real game by the scripts in `tools/promo/`:

```sh
node tools/promo/trailer.mjs          # promo/video: the 30-second trailer, frame by frame, with the game's own sound
node tools/promo/check-trailer.mjs    # its length, size, frame rate, loudness and the sound in every second
node tools/promo/stills.mjs           # promo/images, promo/itch: hype images, covers, banner, tile, screenshots
```

They open the built game with every clock held and Math.random seeded, so a run gives the same pictures every time (the trailer's sound to within one 16-bit step), and use the game's own font from `tools/promo/fonts/` (Cascadia Mono, SIL Open Font License). `promo/` is kept off Vercel (`.vercelignore`).

## Read more

| Document | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | how it is built: the pipeline, the threads, the world data, the kit, the people, the sound, the progress store |
| [docs/art-bible.md](docs/art-bible.md) | the look's rules |
| [docs/scale.md](docs/scale.md) | the numbers the world is built to |
| [docs/design.md](docs/design.md) | the rules of play |
| [docs/facts.md](docs/facts.md) | true numbers about the game, each with how it was measured |
| [docs/qa-0.6.md](docs/qa-0.6.md) | the 0.6.1 audit, its faults (fixed in 0.6.2) and the known limitations |
| `docs/phase0a.md` to `docs/phase6.md` | each phase's record, with pictures and measurements |

The private `reference/` folder (other people's footage, used to judge the look) is never published, nor bundled into the page.
