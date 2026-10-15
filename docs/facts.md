# Facts

True numbers about Land of Ascii 0.6.1, each with the command that produced it. Most come from `node tools/facts.mjs`, which counts them from the game's own code and worlds and writes them to `shots/facts/facts.json`; none is typed in by hand. Where a number is a time or a size in memory, it comes from one machine: an Apple M1 Max (10 cores: 8 fast, 2 slow), 32 GB, macOS 27, measured on 15 Oct 2026. Other machines will differ.

## The file

`play.html` is the whole game: one file, with no other request once it has loaded.
- **Size:** 1,038,168 bytes (1,013.8 KB), before the host compresses it.
- **The front page**, `index.html`: about 64 KB since 0.6.3 (it draws the title screen's stone frame with the game's own code); 37,377 bytes in 0.6.1.

What each part adds, from esbuild's own account of the bytes each source file adds (`node tools/facts.mjs --size`). The renderer, the world code and the look data appear twice, once in the page and once in the render workers' code, which is carried in the same file.

| Part | Bytes | Share |
|---|---|---|
| the renderer | 216,828 | 20.9% |
| the world generator | 215,717 | 20.8% |
| the page, the menus and the input | 171,587 | 16.5% |
| the world data, the building kit and the tools' scenes | 170,641 | 16.4% |
| people | 59,397 | 5.7% |
| wayfaring (the journal, favours, the map, progress) | 46,474 | 4.5% |
| animals | 41,315 | 4.0% |
| the look data (palette, keyframes, materials) | 41,077 | 4.0% |
| the page's HTML and CSS | 37,463 | 3.6% |
| sound and music | 37,412 | 3.6% |

By where it runs: the page's script is 664,108 bytes (64%), the render workers' 336,471 (32%), and the HTML and CSS 37,463 (4%).

## The code

`node tools/facts.mjs --code`. Lines are every line of each file, comments included.

| Area | Files | Lines |
|---|---|---|
| the page, the menus and the input | 38 | 6,391 |
| the renderer | 23 | 5,663 |
| the world generator | 17 | 4,489 |
| the world data, the kit and the scenes | 17 | 3,550 |
| people | 11 | 1,845 |
| wayfaring | 7 | 1,464 |
| sound and music | 5 | 1,266 |
| animals | 6 | 1,265 |
| the look data | 2 | 853 |
| the front page | 2 | 229 |
| **the game, in all** | **128** | **27,015** |
| the tools | 33, plus 10 shared library files | 7,048 |
| **in all** | **171** | **34,063** |

No source file is longer than 600 lines (the longest is 599). The game uses no library: esbuild builds it and Playwright runs the tools, and neither is in the page.

## The world

From `src/world/scale.js` and `docs/scale.md`.
- **Size:** 2,048 × 2,048 m, a cell a metre, with no wrapping. The sea lies to the south and west, the mountains to the north and east.
- **Speeds:** walking 4.5 m/s and running 8 m/s, along the ground.

| | Distance | Walking | Running |
|---|---|---|---|
| across, one side | 2,048 m | 7.6 min | 4.3 min |
| corner to corner | 2,896 m | 10.7 min | 6.0 min |
| round its edge (the south and west edges are sea) | 8,192 m | 30.3 min | 17.1 min |
| the spawn to the fort's gate, by the roads (seed 3) | 1,368 m | 5.1 min | 2.9 min |
| all the roads (seed 3) | 2,316 m | 8.6 min | 4.8 min |

## What a world holds

`node tools/facts.mjs --world` builds each world in Node exactly as the game builds it. Seed 3 is the default; the sixty are the seeds the world check sweeps.

| | Seed 3 | Mean over 60 seeds | Least–most |
|---|---|---|---|
| trees | 11,824 | 11,850 | 11,717–11,972 |
| bushes | 503 | 536 | 321–868 |
| copses | 32 | 29.5 | 17–32 |
| boulders | 310 | 301 | 254–361 |
| rock outcrops | 16 | 24.4 | 11–45 |
| logs | 243 | 251 | 195–302 |
| stumps | 383 | 384 | 304–485 |
| reed beds | 43 | 48.2 | 12–92 |
| people | 58 | 59.9 | 44–73 |
| animals | 255 | 239 | 184–276 |
| sheep | 62 | 68.2 | 38–104 |
| buildings | 59 | 56.8 | 38–72 |
| village houses | 41 | 42.1 | 26–57 |
| villages | 3 | 3 | 3–3 |
| towers of the fort | 6 | 5.0 | 4–6 |
| bridges | 2 | 1.28 | 0–3 |
| roads | 2.32 km | 2.34 km | 1.85–3.27 km |
| lakes | 6 | 5.33 | 2–12 |
| rivers | 3 | 2.08 | 1–3 |
| viewpoints | 4 | 4 | 4–4 |
| places to find | 16 | 14.4 | 12–16 |
| favours | 15 | 12.5 | 10–16 |
| torches | 47 | 42.8 | 35–50 |

Seed 3's people: 16 farmers, 15 householders, 9 guards, 4 shepherds, 3 keepers, 3 carters, 3 travellers, 2 fishers, 2 wellkeepers and 1 minder. Its animals: 86 small birds, 62 sheep, 27 deer, 19 hens, 14 ducks, 13 gulls, 12 hares, 9 crows, 8 cattle, 3 dogs and 2 large birds. Its buildings: 41 village houses, 6 barns, 3 chapels, the fort's 6 towers, its keep and 2 houses.

## The picture

`node tools/facts.mjs --code --screen --rays`.
- **Glyphs:** 28.
- **Materials:** 61.
- **Colours:** 617 distinct colours written in the look data: the palette's keyframes (day, dawn, dusk, night under the moon and under the stars), the materials, the sky and the light.

Cells on screen at each detail level (a 1440 × 900 window at a pixel ratio of 2, as on a laptop's screen):

| Level | Grid | Cells |
|---|---|---|
| coarse | 220 × 69 | 15,180 |
| medium | 288 × 90 | 25,920 |
| fine (the usual choice) | 360 × 112 | 40,320 |
| finest | 410 × 128 | 52,480 |

Bigger screens are drawn at about the cost of a 1440 × 900 one: a 4K screen at fine is 384 × 108, 41,472 cells.

Rays a frame at fine (360 × 112), counted by the renderer itself in Node. One ray goes through each cell, and water adds one ray for its reflection and one into it:

| Camera | Rays |
|---|---|
| the lake shore (the heaviest) | 62,708: 40,320 direct, 11,734 reflected, 10,654 into the water |
| the spawn | 44,791 |
| inside a forest | 40,600 |

## Speed and memory

`node tools/bench.mjs --scene world --built --threads 8 --density 3` (and `--browser firefox`, `--browser webkit`; `--weather rain`). The slowest of the fixed cameras, the lake shore, at fine with 8 render workers. The time is the workers' time for one frame, plus the draw call; rain is the median of three runs, as one run can be 20% off. The median camera takes 4.8 ms in Chromium, 6.4 ms in Firefox and 5.1 ms in WebKit.

| Browser | Fair | Rain | World built |
|---|---|---|---|
| Chromium | 7.92 ms | 8.29 ms | 3.57 s |
| Firefox | 10.78 ms | 9.98 ms | 5.06 s |
| WebKit (headless) | 7.94 ms | 8.30 ms | 3.37 s |

- **The world's build, by stage** (Node, seed 3, `node tools/facts.mjs --world`): 3.8 s in all. The ground's detail takes 1.64 s, the land 0.59 s, the trees 0.44 s and the rest under 0.3 s each.
- **Memory, counted once:** 619 MB with 8 render workers in Chromium (the bench's memory line). Of that, 180 MB is shared: the world's arrays (135 MB) and the two shadow stores. The page and its workers' own buffers are the other 439 MB. See the untrue numbers below.
- **The page's own work** (the main thread): 0.5 ms a frame for animals, people, sound, the journal and the draw call together, about 11% of one core.
- **A cold load** of the live site: the front page in 0.26 s, and the first frame of the game 4.85 s after `play.html` is opened (7.00 s on slow 4G). The world's build is 3.5 s of it. (`node tools/audit.mjs --only cold`, on live 0.6.1)
- **A month in the game** (30.6 game days at an hour a second, 12.2 min): the clock kept exact time, and memory rose 14 MB. (`node tools/audit.mjs --only long`)

## Sound and words

`node tools/facts.mjs --code`.
- **Sounds:** 32 kinds, all made in code, with no recording in the file: wind, rain, the lake, rivers, the sea, birdsong, the dawn chorus, gulls, crows, finches, sheep, cattle, hens, ducks, dogs, deer, eleven step sounds (seven grounds, and a splash, a creak, a landing and an echo), torches, hearths, wells, the chapel's bell and door latches.
- **Music:** 3 tracks, each made in code and running into the next.
- **Spoken lines:** 329. That is 137 greetings and 192 lines for favours and exchanges.

## The checks

What the tools check, and on what (the README has the commands):

| Tool | What | On |
|---|---|---|
| world check | each world built twice to the same hash; every place reachable; the roads' slopes and fords; the rivers reach the sea; no tree in water or on a road; the sky test (1,400 views); far readability; the fort and each village walked by a search (hundreds of thousands of states) and by 1,000 random walks; every person and animal sampled every ten minutes for three days; every favour done by a scripted player who knows only its words | 5 seeds; the fort, villages, people, animals and favours on 60 seeds |
| identity | every number of workers (0, 1, 3, 5 and 8, shared and not) draws the same cells | 194 views in five scenes |
| regression set | the fixed cameras, cell for cell, against the saved set | 276 frames |
| flicker | blinking cells while walking and turning | 22 walks and turns in the people, animal and building sets, and more in the world, water and fort sets and the skyline |
| menu check | the menu, the title, the keys and the settings, by keyboard and mouse | 99 checks |
| progress check | saving, backups, restoring, no storage | 39 checks in each of Chromium, Firefox and WebKit |
| sound check | nothing clips, the voices are held, the cost per frame | 30 stops |
| audit | resizing, switching, opening from disk, Pages, a cold load, a month of game time, moved keys, the menu by keyboard, the largest text, broken storage, edited backups | 62 checks |

## Commits

`node tools/facts.mjs --git`: 143 commits, counting the one that adds this sheet. The first commit was on 9 Oct 2026 at 23:52, and 0.6.1 came out on 15 Oct, five and a half days later.

## Numbers that are not true

Never say these:
- **"2.2 GB of memory."** Chromium reports 2,238 MB because it counts the shared world again for each thread that reads it. Counted once, it is 619 MB.
- **"An infinite world" or "endless".** It is 2,048 m a side, and it ends.
- **"Ray traced on the GPU."** The rays are marched on the CPU, in web workers; the GPU only draws the finished grid of letters, in one call.
- **"60 frames a second everywhere."** On GitHub Pages or from a file there are 4 workers without shared memory, and Firefox draws the lake shore at about 30 frames a second there.
- **"Loads in a second."** The front page does; the game's first frame takes about 5 s, most of it building the world.
- **"12,000 trees."** Seed 3 has 11,824; no seed of the sixty reaches 12,000. Say "nearly 12,000".
- **"Hundreds of people."** Seed 3 has 58, and no seed of the sixty has more than 73.
- **"Recorded sound" or "a soundtrack".** Nothing is recorded; every sound and the three tracks are made in code as they play.
- **"Plays on a phone."** The front page does; the game needs a keyboard and a mouse.
- **"AI-generated."** Nothing in it is made by a model. The world comes from a seed, by rules written in the code.
- **"Every frame is a million characters."** At fine it is 40,320 cells.
- **"No dependencies."** The page has none, but the build needs esbuild and the tools need Playwright.

## Claims to quote

Each is true, in the game's own quiet voice:
- A land drawn in letters: about forty thousand of them every frame, each one found by a ray.
- The world is two kilometres across, and it is built from a single number in a few seconds.
- Every villager keeps a day of their own, from the seed, the day and the hour.
- There is no recording in it. The wind, the birds, the bell and the music are made as they play.
- The whole game is one file of about a megabyte.
- Fifty-eight people, two hundred and fifty-five animals and nearly twelve thousand trees, on the default seed.
