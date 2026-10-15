# How Land of Ascii is built

Written 15 Oct 2026, for 0.6.1. It describes the game as it is now, so a newcomer doesn't have to read the thirteen phase records. Each part names the files to read first. The rules for how the land looks are in [art-bible.md](art-bible.md), the numbers it is built to in [scale.md](scale.md), and the rules of play in [design.md](design.md).

## One page, one file

The game is plain JavaScript in ES modules, with no runtime dependencies. `npm run build` (`tools/build.mjs`, esbuild) bundles `src/` into one self-contained `play.html`. The render worker's bundled source is carried inline and started from a blob URL, or from a data URL when the file is opened from disk. The front page, `index.html`, is a separate small page that never loads the game (`src/front/`).

## The picture: a fixed contract in three layers

```
  frame description              (src/contract.js: camera, grid, hour, day, weather,
  made on the page each frame     people, animals, lights; nothing else)
          │
          ▼
  scene backend  ──────────────►  HitBuffer  ──────────►  resolve  ──────────►  CellBuffer  ──────────►  presenter
  src/scene/cpu/                  what each cell's ray    src/resolve.js         one glyph, a background  src/present/gl.js
  march.js   the column march     met: material, light,   src/palette.js         and an ink colour per    WebGL2, one draw call,
  shade.js   ground and water     shadow, cloud, glow,    src/strokes.js         cell (8 bytes)           the glyph atlas
  reflect.js mirrored rays        tone, distance, in      the look's colours                              (src/present/atlas.js)
  objects.js trees and buildings  three records (direct,  (src/look.js and
  trees.js   conifers, bushes     mirrored, the bed under src/look/keys.js),
  build*.js  the kit's shapes     water); 24 bytes a cell haze, the glyph rung
  figures.js people, animals
  sky.js     sky, clouds, stars
  light.js   sun, moon, shadows
```

- **One stripe at a time.** A worker renders only its own stripe of columns (`src/render-stripe.js`): the backend fills a HitBuffer, and resolve turns it into cells. Nothing in a cell depends on which stripe it is in or how many workers there are; `tools/identity.mjs` checks this every phase.
- **Exact and stateless.** Every detail is fixed to the land (noise from world positions), never to the screen, so walking slides detail smoothly rather than making it blink. With the clocks frozen the picture repeats exactly.
- **The look is data.** Every colour, glyph family, ladder, haze and light level is in `src/look.js` (keyframes in `src/look/keys.js`). Renderer code never hard-codes a colour.

## The threads

```
  the page (src/main.js)                                   builder worker (once)
  ├─ input, the player, the clock, the weather             └─ generates the world from the seed
  ├─ people and animals (states each frame)                   (src/world/gen/world.js), packs it
  ├─ wayfaring: discovery, favours, saving                    into arrays (src/world/pack.js)
  ├─ the sound (Web Audio)                                         │ shared memory (or copies)
  ├─ frame pacing (src/app/pace.js)                                ▼
  └─ the presenter ◄── stripes of cells ──  render workers ×N  ── read the one world ──┐
                       (transferred)        (src/worker.js,                             │
                                             cores − 2, at most 8)                      │
                                                    ▲                                   │
                                                    └── cast shadows: two shared stores ┤
                                                        swept by the shadow worker ◄────┘
```

- **Shared memory** where the page is cross-origin isolated (the Vercel copy sends the headers). The world's arrays (about 135 MB) and the two shadow stores (22 MB each) are SharedArrayBuffers that every thread reads. One shadow worker sweeps the light's newest step into one store while frames read the other (`src/app/worldboot.js`).
- **The fallback** (GitHub Pages, a file on disk): each render worker gets its own copy of the world and sweeps its own shadows, so the page uses at most four workers.
- **Pacing.** Up to two frames are in flight. Each is shown the same number of display refreshes after it was asked for, a late one is dropped, and the rate falls to every second refresh (or less) when the workers cannot keep up (`src/app/pace.js`). The stripes' edges move toward equal shares of the last frame's work (`src/app/pool.js`).
- **The tools' scenes** (the Look Lab `?lab=1`, the stress scene `?stress=1`, the building yard `?yard=1`): each worker builds its own copy, from constants (`src/app/boot.js`).

## The world data

`generateWorld(seed)` (`src/world/gen/world.js`) is a generator that yields its progress. The same seed gives the same world, byte for byte, on any thread. In order:

1. **Land:** the shape (`land.js`); rain, lakes and rivers by hydrology (`water.js`); the lakes' hollows (`basins.js`).
2. **Forests and sites:** where forests grow (`plants.js`); the fort, the villages, the viewpoints and the spawn (`sites.js`).
3. **Roads** by least-cost search (`roads.js`), with bridges where they cross rivers.
4. **The fort** from the building kit (`fort.js`), levelled onto its site.
5. **The villages** (`village.js`, with `placing.js`, `fields.js`, `paths.js`, `pastures.js`).
6. **Trees and the ground:** trees, bushes and copses; what the ground is made of (`ground.js`); the wild ground detail (`wild.js`); the coarser terrain levels for distant marching (`src/world/terrain.js`).
7. **The cameras** the tools use, found from the data (`cameras.js`).

The world is a few dozen arrays over the 2,049 × 2,049 grid: heights, water, material weights, tone, and a code that marks squares where shading can skip the weights. Alongside them sit the trees, the kit's compiled shapes, the sites and the roads as JSON.

## The building kit

Structures are data. A list of pieces (a wall, a gate, a tower, a cottage, a well, a jetty, a boulder) is turned into exact shapes (`src/world/kit-pieces.js`, `kit-village.js`, `kit-wild.js`). These are compiled into flat tables (`src/world/kit.js`) that the renderer (`src/scene/cpu/build.js`), the cast shadows, the player's walking and collision (`src/app/player.js`) and the tools all read. What is drawn is what stops a walker. The building yard (`?yard=1`) shows every piece alone.

## People and animals: timetables, not simulation

- **People** (`src/world/people/`): who lives where comes from the seed (`build.js`). Each person's day is a plan worked out from the seed, the day and the forecast (`plans.js`), along routes on the way network (`net.js`, `routes.js`). Where they are at any moment is a pure function of the plan and the clock (`people.js`, `stateAt`), so far-off people cost nothing and fast time simply works. Meetings nudge people aside by an amount that depends only on positions (`meet.js`).
- **Animals** (`src/world/animals/`) follow the same idea: a function of the seed, the day and the hour, with one local, stateless reaction to how near a walker is.
- **On the page** (`src/app/people.js`, `src/app/animals.js`): each frame works out everyone's state and sends it to the workers in the frame, so every worker draws the same people.
- **The one exception** to "nothing changes anyone's day" is the first meeting. In a first session, the first favour's giver walks out to the spawn's road (`docs/design.md`, section 2).

## Weather and sky

The weather is a pure function of the seed, the day and the hour (`src/weather.js`): a forecast, never a simulation. The frame carries it as a mix of five kinds, plus how wet the ground is and how far the clouds have drifted. The sun and the moon, with its phase, follow from the hour and the day (`src/world/sky.js`).

## The sound engine

All of it is made in code on the Web Audio API, with no audio files (`src/sound/`):
- **The palette:** every level, filter and envelope (`palette.js`).
- **The voices:** made of oscillators, filtered noise and envelopes (`synth.js`).
- **Where sounds come from:** the water's edges, the forest edges, fires, wells, chapels and the gate passage, worked out once per world (`scene.js`).
- **The engine:** places each sound by direction and distance, plays events on the game's clock and holds at most 16 voices (`engine.js`).
- **The music:** three fixed pieces composed in code from seeds, running into each other (`music.js`).

The sound stays silent until the first click or key.

## Wayfaring and the progress store

`src/game/` holds the rules:
- **Discovery** (`discovery.js`): what has been seen, on 16 m squares.
- **Places** (`places.js`) and **sight lines** (`sight.js`).
- **Favours** (`favours.js`) and **their words** (`words.js`).
- **Signposts** (`signs.js`).
- **The progress record** (`progress.js`): the one piece of state the game keeps.

`src/app/wayfaring.js` keeps it up to date each frame and spreads a save over four frames.

Progress is one record per world (seed) in local storage under `land-of-ascii-v3.progress.<seed>`, plus one entry for each sketch. A backup is the record and its sketches, deflated and written as base64 text. When the browser keeps nothing, the game runs for the session only.

## The page's modules

`src/main.js` boots the page and runs the loop: the frame description, the clock and the pacing. The parts that read or set its state get a small `app` object of live getters:

| Module | What it does |
|---|---|
| `src/app/boot.js` | builds the scene and starts the workers |
| `src/app/present.js` | shows a finished frame, or the map |
| `src/app/acts.js` | greet, sketch, the lantern |
| `src/app/notes.js` | the prompt, the signpost, notes, the hint |
| `src/app/panels.js` | the menu and the journal opening, and Escape |
| `src/app/titleflow.js` | the title screen's flyover, Play and Continue, and measuring the detail level on a first visit |
| `src/app/comfort.js` | the pause, full screen, the share link |
| `src/app/game.js` | the game as the menu sees it |
| `src/app/lab.js` | `window.lab`, the handle the tools drive the page with |

The rest of `src/app/` is the user interface itself: the menu, the journal, the title panel, the map and its drawn layer, the statistics, input and keys, the settings, and the icons.

## The tools

They live in `tools/` and run in Node and Playwright; the README lists them. They share one way of opening a page (`openLab` for a quiet tool page, `openVisitor` and `play` for a visitor), and one way of standing somewhere with every clock frozen (`view`, which is `lab.view`); both are in `tools/lib/game.mjs`. The checks that hold the game in place:

| Tool | What it holds |
|---|---|
| `tools/world-check.mjs` | worlds (with `tools/lib/check-*.mjs`) |
| `tools/identity.mjs` | worker counts draw identical cells |
| `tools/lookbook.mjs --regress` | the picture, against a saved set |
| `tools/flicker.mjs` | blinking |
| `tools/menu-check.mjs`, `tools/progress-check.mjs` | the menus and saved progress |
| `tools/sound-check.mjs` | the sound |
| `tools/bench.mjs` | frame times |
| `tools/audit.mjs` | what the other tools do not cover |
