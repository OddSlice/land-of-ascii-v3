# QA report: 0.6.0 to 0.6.1

Written 15 Oct 2026. Phase 6.1 is a QA and engineering pass, with nothing new to see or play. It covers four things:
- an audit of every system, with the game's own tools and with a new audit of what they don't cover (`tools/audit.mjs`);
- a search for speed that leaves every cell unchanged;
- a clean-up;
- this report and the fact sheet ([facts.md](facts.md)).

Every number here comes from one machine: an Apple M1 Max (10 cores: 8 fast, 2 slow), 32 GB, macOS 27. The background load was the Claude app (about 30–60% of one core), WindowServer, Spotify and an idle virtual machine. No other copy of the game and no local model server was running. WebKit was measured headless.

**What changed in what the player sees: one thing.** At the largest text size in a short window, the title screen's version line no longer sits on its panel (F3). Every frame of every fixed camera is otherwise identical, cell for cell, to 0.6.0's.

---

## 1. The audit table

The game's own tools, run on 0.6.0 (commit `7210442`) and again on 0.6.1, the final build.

| Tool | Command | 0.6.0 (15 Oct) | 0.6.1 (15 Oct) |
|---|---|---|---|
| World check, five seeds | `node tools/world-check.mjs` | 5 of 5 pass | 5 of 5 pass; the same world hashes (seed 3 `818f3d8e`) |
| World check, sixty seeds | `node tools/world-check.mjs --fort-only --seeds …` (four shards of 15) | 60 of 60 pass; 749 favours played from their words; 862 of 862 places found by walking | 60 of 60 pass; the same totals, to the last favour, place, person and animal |
| Identity: every worker count draws the same cells | `node tools/identity.mjs --scene all --built` | 194 of 194 (Look Lab 14, stress 7, yard 61, world shared 56, world fallback 56) | 194 of 194 |
| Regression set | `node tools/lookbook.mjs --regress --built` | 276 of 276 identical | 276 of 276 identical (the nine frames of F5 saved again first) |
| Menu, title, keys and settings | `node tools/menu-check.mjs` | 99 of 99 | 99 of 99 |
| Saved progress | `node tools/progress-check.mjs --built --browser …` | 39 of 39 in Chromium, Firefox and WebKit | 39 of 39 in Chromium, Firefox and WebKit |
| Sound | `node tools/sound-check.mjs --built` | 30 of 30 stops; peak 0.193 after the limiter; at most 10 voices; 0.060 ms a frame | 30 of 30 stops; peak 0.208 after the limiter (it varies by run: 0.193 to 0.208); at most 10 voices; 0.065 ms a frame |
| Flicker: people, animals, buildings | `node tools/flicker.mjs --people` (`--animals`, `--buildings`) | as the table below | the same on all 22 walks and turns |
| Bench | `node tools/bench.mjs --scene world --built --threads 8 --density 3` | section 4 | section 4 |
| Audit (new) | `node tools/audit.mjs` | 59 of 62: F1, F2 and F3 | 60 of 62: F1 and F2 (proposals, section 7); the text area passes since F3 |

Flicker (cells that blink, as a share of the frame: glyph / colour).

| View | 0.6.0 | 0.6.1 |
|---|---|---|
| the green | 0.161 / 0.100 | 0.161 / 0.100 |
| the street at 15:30 | 0.717 / 0.659 | 0.717 / 0.659 |
| the flock | 0.303 / 0.175 | 0.303 / 0.175 |
| the boulder field | 0.203 / 0.015 | 0.203 / 0.015 |
| walking up to the reeds | 0.377 / 0.335 | 0.377 / 0.335 |
| walking into the reeds | 0.315 / 0.304 | 0.315 / 0.304 |
| the fort road | 0.182 / 0.043 | 0.182 / 0.043 |
| the fort's wall walk | 0.345 / 0.216 | 0.345 / 0.216 |
| the courtyard | 0.183 / 0.101 | 0.183 / 0.101 |

Every view is exactly as it was in 0.6.0. Those the earlier phases left over their bars (the street, the flock, the reeds, the boulder field) stay deferred (section 5).

## 2. What the tools don't cover

`tools/audit.mjs` drives the built game in Playwright. Each area runs alone with `--only` (for example `node tools/audit.mjs --only backup`). Results are in `shots/audit/`.

| Area | What was done | Result |
|---|---|---|
| resize | the window resized eight times while walking, from 412 × 789 to 2597 × 1417, with shared memory and without | passes: frames keep coming and the grid follows each size |
| switch | the detail level switched seven times while walking, then − and + pressed quickly; opened with 0, 1, 2 and 8 workers | passes |
| disk | `play.html` opened from the disk in Chromium, Firefox and WebKit: the title, Play, walking | passes: 4 workers each, without shared memory |
| pages | the GitHub Pages copy: the version, the isolation, the worker count, walking | passes: version 0.6.1, not isolated, 4 workers, without shared memory |
| cold | a cold load of the live site, unthrottled and on slow 4G | passes. On 0.6.0: the front page in 0.41 s; unthrottled, the first frame at 5.26 s (title up 4.88 s); on slow 4G at 6.84 s (the 1 MB page parsed at 2.18 s). On live 0.6.1: the front page in 0.26 s; the first frame at 4.85 s (title up 4.49 s), and 7.00 s on slow 4G. The world is built in 3.4 to 3.6 s each time. |
| long | 30.6 game days at an hour a second (12.2 min), with the sound and progress on, in a headed Chromium | passes: the clock kept exact time (734.2 game hours in 734 s); the heap went from 69 to 89 MB, the page and workers from 1,357 to 1,371 MB, and the worker median from 6.10 to 5.85 ms; no errors |
| keys | 13 actions moved to other keys | passes: each moved key does its action and its default does nothing; the first walk's hint names the moved keys |
| menu | every control of every menu section pressed by the keyboard alone | passes: 125 pressed (48 that leave the page or take a key skipped) |
| text | the largest text at 1024 × 640: the title, all five menu sections, the journal's four pages, the exchange, a signpost, the map | failed on the title in 0.6.0 (F3); passes in 0.6.1 |
| storage | the front page and the game with every storage call throwing | passes: the game says plainly that nothing will be kept, and plays |
| backup | 19 edited backups restored, then the game played and reloaded | 17 of 19: F1 and F2 |

## 3. The fault log

Each fault with the seed, the hour, how to reach it and its cause.

| | Fault | Seed, hour, steps | Cause | Now |
|---|---|---|---|---|
| F1 | A restored backup whose `met` names someone not in this world makes the journal throw, and the page stops. | Any seed and hour. Menu, then World, Restore a backup, with a `met` entry whose id is not a person here. Open the journal. | `journal()` reads the person's `village` without a check. | **Proposal** (saved progress): check each entry when a record is read (P1). |
| F2 | A `met` entry that is `null` throws in the wayfaring step and in the journal's sort. The record is already saved, so the game fails near that person after every reload, and after the failure the menu can't open. The player is locked out until the site's data is cleared. | As F1, with `null` for a `met` entry. | `fromJSON` keeps entries it can't use. | **Proposal** (saved progress): P1. |
| F3 | At the largest text on a 1024 × 640 window, the title's version line sat on the title's panel (the panel is 664 px tall in 640). | Seed 3, any hour. Settings, Text: largest; resize to 1024 × 640. | The title's layout had no rule for short windows. | **Fixed** (`6528f26`): tighter spacing below 700 px of height. |
| F4 | A stored record the game can't read (from another version, or damaged) is replaced by a fresh one at the first save, so it is lost. | Edit the stored record in the browser's storage, then play. | The progress store treats an unreadable record as none. | **Proposal** (saved progress): set an unreadable record aside under another key (P2). |
| F5 | The building yard's three animal cameras in the air (14, 22 and 30 m up) changed on every frame with every clock frozen, so their pictures depended on when a tool read them. | `?yard=1`, cameras 40 to 42, any hour, `?threads=0` too. | The cameras were not held, so the eye fell under gravity, 9.5 cm in the first frame. | **Fixed** (`39a5211`): the cameras are held in the air, as `lab.setCamera` with a height already was. Their frames are steady and equal to the Node render; the nine affected frames of the regression set were saved again. A tools' scene only: the game is unchanged. |

Quirks found while restoring backups, all harmless today and all saved progress, so left as they are:
- a restore accepts 200 sketches (the game keeps 60);
- it accepts a seed above 2³², stored under a key the game can't open;
- it accepts `seen: '!!!!'`, which reads as an empty map.

Faults in the tools, fixed in the tools:
- the audit pressed Enter before the title's panel had come forward, which failed the key and menu areas falsely;
- Chromium refuses its memory measure in a headless browser, so the long run is headed;
- `flicker.mjs` and the others kept look options that no longer exist (section 6).

## 4. Performance

### Where the frame goes

A profile of the slowest camera, the lake shore, rendered in Node on one thread (58 ms):

| Part | Share |
|---|---|
| the march over the land and water (`march.plane`) | 45%: the ground's shading 21.5%, water 8% |
| objects (trees, people, animals) and buildings | 21% and 4.6% |
| the sky | 10.6%, of which clouds 7.7% |
| resolve (hits into cells) | 10.9% |
| the rest | under 8% |

### Exact savings

The search was for savings that leave every cell unchanged, proven by identity and the regression set. Tried:
- the cloud sampler with each puff's sums worked out once a frame;
- a stripe balancer that remembers each worker's cost;
- timing each stripe to find the slow ones.

The first saved 0.3%, inside the noise; the second gained nothing; the third only measured. All three were reverted. The march, the objects pass, the reflections, resolve and the upload were also read for repeated work, and nothing was found that would be worth its code. **No exact saving was found worth keeping.** What remains costs time because of what the picture draws (the three largest costs, below).

### The budget

- **Stripes.** The slowest of the 8 stripes runs 30–46% above their mean whichever way the rows are split. The machine has 8 fast cores and 2 slow ones, and the slowest stripe is the one that lands on a slow core. Eight workers stays the best count:

| Workers | 6 | 7 | 8 | 9 |
|---|---|---|---|---|
| Chromium, the lake shore | 9.93 ms | 8.70 ms | 7.63 ms | 9.30 ms |
| Firefox, the lake shore | 12.18 ms | 10.60 ms | 9.50 ms | 12.34 ms |

- **More than four workers in the fallback** (Pages, a file opened from disk). Each worker holds its own copy of the world:

| Workers | Chromium | Firefox |
|---|---|---|
| 4 (now) | 14.2 ms, +2,151 MB | 21 ms (30 fps), +1,672 MB |
| 6 | 9.9 ms, +2,917 MB | 15 ms, +2,134 MB |
| 8 | 7.6 ms, +4,016 MB | 12 ms (59 fps), +2,659 MB |

  Eight would reach 60 frames a second at twice the memory, which most machines that open Pages can't spare. Four stays (P4 below has the better way).

- **A view distance of 2,000 m or more.** Measured at render time on the 20 world cameras: the frame cost rises 1% (15% on the ridge-top vista), and 0.17% of cells change, so it is not exact. The sky's share is unchanged. `SCALE.viewDist` also guides the generator's choice of the spawn, so the change reaches the world as well as the look. **Proposal** (P3).
- **Density 4 as the automatic choice.** The first-visit measure already tries the finest level and keeps it where it holds its frame budget. This machine measures the finest at 13.3 ms at the 90th percentile against the 10.5 ms bar, so it keeps fine. Nothing to change.

### Before and after (the bench, density 3, 8 workers, the slowest camera: the lake shore)

| Browser | 0.6.0 fair | 0.6.0 rain | 0.6.1 fair | 0.6.1 rain | World built (0.6.0 → 0.6.1) |
|---|---|---|---|---|---|
| Chromium | 8.25 ms | 7.83 ms | 7.92 ms | 8.29 ms | 3,569 → 3,574 ms |
| Firefox | 10.52 ms | 9.98 ms | 10.78 ms | 9.98 ms | 5,071 → 5,060 ms |
| WebKit (headless) | 8.04 ms | 8.34 ms | 7.94 ms | 8.30 ms | 3,597 → 3,372 ms |

The limits are 10 ms for Chromium and WebKit and 12.5 ms for Firefox. The two builds draw the same cells, so any difference is the machine's noise; 108 views under clear, overcast, rain and mist were also compared with 0.6.0's build, and all are identical. The noise is larger than it looks: three rain runs of 0.6.1 measured 9.36, 8.29 and 7.87 ms in Chromium and 11.34, 9.98 and 9.94 ms in Firefox, so the rain column gives their median. A single run can be 20% off.

### The main thread, per frame (Chromium, the lake shore)

| Part | ms |
|---|---|
| animals | 0.235 |
| the draw call | 0.100 |
| people | 0.090 |
| sound | 0.060 |
| wayfaring | 0.015 |

The page's main thread is busy 10.8% of one core.

### Memory, counted once

619 MB in all with 8 render workers, on 0.6.0 and on 0.6.1 alike (the bench's memory line, Chromium). Chromium reports 2,238 MB, because it counts the shared memory again for each thread that reads it.

| Part | MB |
|---|---|
| shared: the world's arrays | 135 |
| shared: the two shadow stores | 2 × 22 |
| the page and its workers' own buffers (8 render workers, the shadow worker, the builder) | the other 439 |

### World build time, by stage

In Node, seed 3 (a browser's worker adds about a tenth):

| Stage | ms |
|---|---|
| land | 587 |
| rain | 98 |
| rivers | 73 |
| forests | 273 |
| sites | 231 |
| roads | 211 |
| trees | 441 |
| ground (the ground's detail and its lookup tables) | about 1,648 |
| finishing | about 247 |

The ground stage is the largest in every browser: 1,526 ms in Chromium and 2,817 ms in Firefox.

### Time to the first frame from a cold load

The live site, a fresh browser, on 0.6.1 (`node tools/audit.mjs --only cold`): the front page in 0.26 s; then, on `play.html`, the title up at 4.49 s and the first frame at 4.85 s, of which the world's build is 3.50 s. On slow 4G: the first frame at 7.00 s. (On 0.6.0: 5.26 s and 6.84 s. The two builds load the same work, so the difference is the network's.) The build is three quarters of the wait, which is why it is the second of the three largest costs.

### The three largest remaining costs

1. **Shading the ground and the water** near the lake (about 30% of the slowest frame). Taking it further means changing how the ground's detail is shaded: fewer samples, or a cache that holds a cell's result while the eye moves. Both change cells, so neither is exact.
2. **Building the world** (3.4 s in Chromium, 5 s in Firefox before the first frame). The ground stage is half of it. It could be split across the render workers, which sit idle while it runs. That is exact in principle, but it is a change to the generator's running, which this phase rules out (P5).
3. **Memory in the fallback** (4 copies of the world on Pages and from disk). A service worker that adds the isolation headers (coi-serviceworker) would give Pages shared memory, so the extra copies of the world (135 MB of arrays each) would go. It adds a reload on the first visit (P4).

## 5. The earlier phases' open items

Each phase record ends with what still looked wrong or was not done. Each item below is either closed, by a later phase or here, or deferred, with the reason. "Deferred: the look" means the fix would change the picture, which this phase rules out. Those items stay with the art bible for a future look pass.

### Phase 0b and 0c (decisions to confirm)

| Item | Now |
|---|---|
| Density 3 as the default (0b) | Closed: kept, and measured on a first visit since phase 6. |
| Stress-scene memory, about 1.2 GB with 8 workers (0b) | Closed: shared memory came for the generated world in phase 1; the stress scene is a tool. |
| Turning inside a forest crawls twice as much as 0b (0c) | Accepted in phase 1 with the tidy conifers. Deferred: the look. |
| Chromium at density 4 over the cost limit on the dense forest (0c) | Superseded: density 3 is the default, and density 4 is chosen only where it holds its frame budget. |

### Phase 1 (what looks wrong)

| Item | Now |
|---|---|
| 1. The ridge-top vista is the weakest frame | Closed in phase 2a: the viewpoint at the brow, and thinner haze looking down. |
| 2. The mountains read as hazy hills | Closed in phase 2a: far-land rules and the backdrop range. |
| 3. Nights are almost black | Closed in phase 2a: moonlight and starlight; torches and windows since 3a and 3b. |
| 4. Flat beaches | Closed in phase 2a: the wet band, foam and swell. |
| 5. The wall stands alone | Closed in phase 3a: the fort. |
| 6. The far skyline crawls when turning | Closed in phase 2a: the fading top cell. |
| 7. Firefox's lake view over 10 ms | Closed: the limit is 12.5 ms for Firefox, and the lake shore measures 10.5 ms (section 4). |
| 8. R reloads the page for a new world | Deferred: by design, so the old world's memory is freed. A new world in place would hold two worlds at once (about 135 MB of arrays each). |
| 9. The lowland is thin between the stands | Closed in phase 4b: boulders, logs, reeds, flowers and animals. |

### Phase 2a (what still looks wrong)

| Item | Now |
|---|---|
| 1. The far range is smaller than the reference's mountain | Deferred: the look and the generator (the sky test holds it). |
| 2. Far rock cool and grey | Closed in phase 2b: warm far rock. |
| 3. The range lit pink at dusk | Closed in phase 2b: a dark silhouette. |
| 4. A thin snow line along crests | Closed in phase 2b: snow judged by relief. |
| 5. Specks in the dawn sky | Closed in phase 2b (they were stars). |
| 6. The coast camera inside the beach | Closed in phase 2b. |
| 7. Firefox's lake view at its limit | Closed: 10.5 ms against 12.5 ms. |
| 8. Conifer tips crawl when turning | Deferred: the look (a tip's fading cell needs the conifer pass to know its cover). |
| 9. The lake's wet band on steep shores | Closed in phase 2b. |

### Phase 3a (what looks wrong; still open after it)

| Item | Now |
|---|---|
| The fort a flat grey silhouette from the road | Partly closed after 3a (paler masonry, darker course joints that show further off). The rest deferred: the look. |
| The gate passage lit hot at night | Closed in phase 3b (dimmer passage torches). |
| The wall walk sees mostly parapet; crenels on far walls drawn as bands; slanted doorways drawn closed; timber framing gone beyond 15–20 m | Deferred: these are the steadiness rules (no blinking). Each is a threshold that could be loosened if a little blinking is acceptable. |
| The keep a plain box, the rooms empty | Partly closed in phase 5b (the hall and a tower room furnished). The rest deferred: content. |
| The yard one flat plane | Closed in phase 3b (a worn path). |
| Square towers present a corner to the yard | Deferred: the kit's plan, which this phase rules out. |
| The road a straight ramp; it grazes a tower's plinth | Closed in phase 3b (a winding approach). |
| Seed 3's platform cut 2.1 m into its rise | Deferred: the generator. |
| The fort across the lake is a few cells | Deferred: the look (distance). |
| Joints between blocks fade by 15 m | Closed in phase 5b (vertical joints held further), with the fort's head joints left faint (below). |
| The raw mouse movement turns off Windows' pointer acceleration | Accepted: the sensitivity is in Display. |
| The Controls tab close to scrolling at 1440 × 900 | Closed in phase 6: compact rows; the menu check confirms it fits at 1280 × 720. |
| The prototypes stay in the build | Closed in phase 3b (removed). |

### Phase 3b (what looks wrong)

| Item | Now |
|---|---|
| 1. The banks beside a stone bridge | Deferred: the generator. |
| 2. Village stone reads as stripes up close | Closed in phase 4a (a coarser block pattern). |
| 3. Few lights from the road in at night | Deferred: content (houses face their lanes). |
| 4. Fields can lie far out | Deferred: the generator. |
| 5. The green not marked on the ground | Deferred: the look. |
| 6. Barns very dark | Deferred: the look. |
| 7. Interiors dim and blocky | Deferred: the look. |
| 8. Footings a pale band | Deferred: the look. |
| 9. A bush's look depends on its place in the list | Closed in phase 4a (its seed from its place on the land). |
| 10. Seed 1's fort-road camera looks at a hillside | Deferred: the cameras come from data, never placed by hand. |

### Phase 4a (what looks wrong)

| Item | Now |
|---|---|
| 1. Still figures flicker on a street | Partly closed in phase 5b. Still over the bar: the street at 15:30, 0.717% glyph flips (section 1). Deferred: the look. |
| 2. Sleepers read as a dark slab | Deferred: the look. |
| 3. Far people look like posts | Partly closed in 0.5.5 (a head held at a row). Deferred: the look. |
| 4. The fishing rod held level | Deferred: the look. |
| 5. Hands and boots vanish past 7 m | By design (the steadiness rules). |
| 6. Evenings are quiet | Deferred: the simulation (people's plans). |
| 7. Guards off watch stand in the yard at night | Deferred: the simulation. |
| 8. Travellers mostly rest | Deferred: the simulation. |
| 9. People vanish at a sill | Deferred: content (doors that open). |
| 10. Head turns are quick | Deferred: the simulation (a head follows within 5 m, now turning the whole standing body since 0.5.5). |

### Phase 4b (what looks wrong)

| Item | Now |
|---|---|
| 1. Sheep flicker beside a flock | Still 0.303% / 0.175% (section 1). Deferred: the look. |
| 2. Reed beds flicker | Still 0.377% / 0.335% walking up to one (section 1). Deferred: the look. |
| 3. A boulder field just over the bar | Still 0.203% against 0.177% (section 1). Deferred: the look. |
| 4. Reeds read as olive mounds | Closed in phase 5b. |
| 5. Small birds and crows hard to see | Closed in phase 5b. |
| 6. Deer small and dim at dawn from 45 m | Deferred: the look. |
| 7. Backing away makes deer slide back | Closed in phase 5b (they remember how far they ran). |
| 8. The fold half hidden by its barn | Deferred: the generator. |
| 9. Sheep legs at middle distance | Deferred: the look. |
| 10. Large birds a speck | Deferred: the look. |
| 11. Flower drifts quiet | Deferred: the look. |

### Phase 5a (what looks wrong)

| Item | Now |
|---|---|
| 1. The map fills quickly along the roads | Partly closed in phase 5b (only standing-out squares count past 160 m). |
| 2. The first meeting moves a person | Accepted (the one exception, design section 2). |
| 3. Time is real time | Accepted (the menu speeds it). |
| 4. Favours turn on a few roles | Deferred: content. |
| 5. Two people can share a name | Deferred: content. The words add the role and the village. |
| 6. A lost thing is small, and hard to see at night | Partly closed in phase 5b (bigger, raised, brighter). |
| 7. Things in the hand are boxes | Closed in phase 5b. |
| 8. The lantern's light is small | By design (the villagers' own). |
| 9. "The farther of the two villages" is stiff | Closed in phase 5b. |
| 10. The exchange's buttons need the mouse free | Closed in phase 5b. |
| 11. Sketches take about 40 KB each in storage | A known limitation (section 8). |
| 12. The exchange does not stop the world | Closed in phase 5b. |
| 13. Places found across a forest | Closed in phase 5b (sight through crowns and roofs). |

### Phase 5b (what still looks or sounds wrong)

| Item | Now |
|---|---|
| 1. The sound not listened to | A known limitation (section 8). |
| 2. Each sound a sketch, not a recording | By design. |
| 3. Every stair is stone and creaks | Deferred: sound content. |
| 4. Reed beds over the flicker bar | See phase 4b, 2. |
| 5. The street at 15:30 at 0.741% | Now 0.717% (0.5.5). Deferred: the look. |
| 6. The fort's head joints faint at 15–25 m | Deferred: the look (darker blinks). |
| 7. The tower rooms dark at night | Deferred: a torch in each changed far views through a coupling never found. |
| 8. A lost thing at night only within a few metres | A known limitation. |
| 9. The deer remember how far they ran | By design (the tools never use it). |
| 10. An exchange stops the clock | By design. |
| 11. The bell's count overlaps at the fastest clock | Deferred: it happens only at "an hour in 4 s", and the fix changes when the bell strikes. |
| 12. The video's walk is smoother than play | A tool matter. |
| 13. The research file and Glyphmoor's sound | Not a fault in the game. |
| 14. The overall level low | Closed in 0.5.4 (90% to start). |
| 15. WebKit slower on the lake shore | Closed: 8.0 ms in fair weather now, against a 10 ms limit. |
| 16. The sound check runs in Chromium only | A known limitation. |

### 0.5.5 and phase 6

| Item | Now |
|---|---|
| The two-tone head's colour flips on a street walk | Accepted by Martin (phase 6). |
| The music not heard | A known limitation. |
| Three kinds of machine not reached for the detail choice | A known limitation. |
| Chromium's mouse lock with full screen not tested | A known limitation (automation refuses the lock). |
| No sound before the first click or key | By the browsers' rules. |
| The title's lake spot at 12–13 ms at the 95th percentile | A known limitation (the heaviest camera at dawn). |
| No page-view counts | Deferred: neither host counts views without adding analytics. |

## 6. The clean-up

| What | Before (0.6.0) | After (0.6.1) |
|---|---|---|
| The look comparison switches: the look panel, keys 5 6 8 9 0, the menu's comparisons, the URL options for them, the reference view (R in the Look Lab) | in the game | removed; every cell unchanged (`d20c531`) |
| Dead code: unused exports, imports, locals and branches | found by the TypeScript checker | removed (`616c213`) |
| Source files over 600 lines | 8 (the largest `main.js`, 1,465) | none (the largest 599) |
| Tool files over 600 lines | 4 (the largest `lookbook.mjs`, 1,625) | none |
| JavaScript source files | 105 | 126 (128 source files in all, with the page and the front page) |
| Source lines | 26,983 | 27,015 |
| Tool lines | 7,852 | 7,048 |
| Ways a tool opens the game and holds a view | one per tool | one: `tools/lib/game.mjs` (`openLab`, `openVisitor`, `play`, `view`) and `lab.view` in the game |
| Scratch and peek tools in `tools/` | `peek.mjs` | removed |
| README | a phase-by-phase log | how to run, build, test and deploy |
| Docs | | `CHANGELOG.md`, `docs/architecture.md`, this report, `docs/facts.md`; the art bible's palette tables regenerated from the data; `scale.md` re-measured |

The splits moved code without changing it. The proof is that the regression set (276 frames) and identity (194 views) were identical before and after each step, and the bundle shrank from 1,018.5 KB to 1,013.8 KB.

## 7. Proposals

Each needs a change this phase rules out, so none was made. Each waits for a yes.

| | Proposal | What it touches | Why |
|---|---|---|---|
| P1 | Check each entry of a record when it is read: drop `met`, `found` and `favours` entries that are malformed or name nothing in this world; cap sketches at 60; refuse a seed outside 0 to 2³². | saved progress | F1 and F2: a bad backup can lock a player out. |
| P2 | Keep an unreadable stored record aside under another key, instead of writing over it. | saved progress | F4: nothing is lost silently. |
| P3 | A view distance of 2,000 m. | the look, the generator's spawn choice | about 1% slower; 0.17% of cells change; needs the sky test, the far readability check and the backdrop re-run. |
| P4 | A service worker on GitHub Pages that adds the isolation headers, so Pages shares one copy of the world. | the build, the Pages copy | three fewer copies of the world there, and 8 workers instead of 4; a reload on the first visit. |
| P5 | Build the ground stage across the idle render workers. | the generator's running | about a second off a first visit. |
| P6 | Restart the bell's count if the hour turns while it is still striking (at the fastest clock only). | the sound | phase 5b, item 11. |

## 8. Known limitations

- The sound and the music are judged by the sound check's measures and one listening pass; the tools can't hear.
- The sound check runs in Chromium only.
- The mouse lock with full screen is not tested in Chromium (automation refuses the lock).
- The first-visit detail measure has been seen on one kind of machine; three kinds of machine were not reached.
- The heaviest title camera (the lake at dawn) reaches 12–13 ms at its 95th percentile on this machine.
- A sketch takes about 40 KB of storage.
- The blinking views over the bar (section 1) are deferred to a look pass.
- There are no page-view counts: neither host counts views without adding analytics.
- R reloads the page for a new world, by design, so the old world's memory is freed.
