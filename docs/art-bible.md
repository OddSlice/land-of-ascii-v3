# Land of Ascii v3: the art bible

Written 10 Oct 2026 in phase 0c as a draft; settled in phase 1, when the look was locked. This is the set of rules every later phase has to obey. It records the rules the look follows (phases 0a and 0b), the ones phase 0c added, the choices locked at the start of phase 1 (section 9), phase 2a's new rules for haze, far land and night (sections 5 and 5b), which replaced phase 1's there, and phase 2b's weather (section 5c) and five look fixes (marked where they apply).

Three things hold it together:
- **`src/look.js` is the only place** where colours, glyphs, ladders and strengths are set. Renderer code reads it and never hard-codes a colour.
- **The tools hold it in place.** `tools/lookbook.mjs --regress` compares the twenty fixed cameras (the lab's nine, the stress scene's three, the generated world's eight) cell for cell with a saved set. `tools/flicker.mjs` turns blinking into a number. `tools/identity.mjs` proves the picture is the same whatever the number of workers.
- **The settled choices** (section 9) were made by Martin, by eye, in the look panel (L), which stays for comparison.

---

## 1. What a cell carries

The picture is a grid of monospace cells, twice as tall as wide: about 40,000 at the default density (3) and 52,480 at the top one, at 1440 × 900.

**A cell is one glyph on a background:**
- the **background** carries the surface's colour under the light that reaches it;
- the **glyph** is a tint of the same colour, a little darker on lit ground and a little lighter in the dark;
- the cell carries no outline and no second material. Colour does most of the work; the glyph adds grain.
- the two exceptions, both things in front of what the cell's ray hit: a cloud's dissolving edge, and (phase 2b) a rain streak, whose glyph stands over the background of whatever is behind it.

**What the renderer knows about a cell** (the HitBuffer, `src/contract.js`), for each ray:
- the material it hit;
- the sun or moon light on the surface, before shadows;
- the cast shadow, the cloud shadow and the torchlight;
- the material's detail, called "tone": patches, joints, a tree's own shade;
- the distance.

A water cell carries three of these records: the surface, what the reflected ray hit, and the bed seen through the water.

**Resolve turns that into the cell** (the CellBuffer), reading nothing but `look.js` and its own cell. The one exception is a faint flame, which is blended with the next cell up its own column.

---

## 2. How a glyph is chosen

**The material picks the family; the light picks the rung.** Each family is a ladder from light marks to heavy marks:

| Material | Ladder (light to heavy) |
|---|---|
| grass | `, : ; " + * % #` |
| forest floor | `. , : ; + %` |
| dirt road | `. : - = + #` |
| sand | `. , : ; = +` |
| rock | `: = % # ▒ ▓` |
| snow | `. - = + *` |
| water | `. : - =` |
| lake bed | `. , : ;` |
| foam (phase 2a) | `. : ; =` |
| wall stone | `: = # ▒ ▓ █` |
| conifer | `: ^ * % # & ▒` |
| trunk | `: | ! I #` |
| bush | `: o % & @` |
| torch post | `: | ! I` |
| cloud | ` . : ░ ▒` |
| flame, sun, moon, stars | `* ^ & @`, `@`, `@`, `. + *` (emissive) |

How the rung is set:
- **A brighter surface takes a lighter mark.** At night the heavy rungs carry what light there is.
- **Emissive things run the other way:** a brighter flame or star is a heavier mark, because the mark is the light.
- **Tone moves the rung** by up to 0.45 of a step (`toneRung`), so neighbouring cells of one material do not all wear the same glyph. Tone is fixed to the land or the object, so this does not crawl.
- **An ordered 4 × 4 dither** of 0.7 of a rung blends the steps.
- **The glyph is never chosen from the finished colour** or from pixel brightness. That was the first build's mistake.

**Ink.** The glyph's colour sits a share of the background away from it:
- darker on fully lit surfaces (`ink.lit`, about −0.25);
- lighter in full shadow and at night (`ink.dark`, about +0.45);
- blended by light in between;
- on near-black cells it is lightened by at least the ink floor (`#2a2c34`), so night glyphs still show.

**Haze fades glyph contrast** with the same share as it closes up light and dark (`glyphFade` 0.9), so distant land is calmer.

**Cloud edges** show two things in one cell: the sky behind as the background and the cloud as a shade block (░ ▒ ▓) over it. The edge dissolves without a hard outline. Phase 2b gives the dissolving edge a minimum depth of 2.5 rows (`clouds.edgeMin`), measured across a puff's smallest radius, so a flat or far puff never thins to a one-cell rim; a puff too small for that fades as a whole instead of scattering into single cells.

**Rain streaks** (phase 2b) are the other: the background is what the ray hit, and the glyph is the streak (`| / \`, by its slant on screen), inked toward the keyframe's rain colour.

The atlas draws the shade blocks itself, because fonts get them wrong at small sizes.

---

## 3. The palette

Colours are named by their role. Keyframes are blended by the height of the sun, so time can run between them:
- day is full once the sun is above 16°;
- night is full once it is 13° below the horizon.

The table gives phase 1's three keyframes, which the night rule 'p1' still uses. Under the default night rule ('moon', phase 2a) twilight is dawn in the morning and dusk in the evening, and night is two keyframes blended by the moonlight: see section 5.

The whole palette is muted and close in value, after the reference: lit and shadowed grass differ mainly in brightness.

| Role | Day | Dusk | Night |
|---|---|---|---|
| Sky, high | `#5266a4` | `#4b3d5d` | `#161927` |
| Sky, horizon | `#6c7e9b` | `#7a5a64` | `#252438` |
| Sky, glow round the sun | `#9aa7bd` | `#c48a6e` | `#2c3046` |
| Haze | `#72839e` | `#5e4d5c` | `#1e1f2c` |
| Cloud, lit top | `#dfe1e8` | `#b48c78` | `#3b3b47` |
| Cloud, underside | `#4c5070` | `#3a3049` | `#1a1b23` |
| Grass, lit | `#6f8a3f` | `#3c4636` | `#212723` |
| Grass, shade | `#2c3827` | `#20272a` | `#131615` |
| Meadow patch, dry | `#859447` | `#4a4f38` | `#262b24` |
| Meadow patch, lush | `#4a6b3c` | `#2e3a33` | `#1a221f` |
| Forest floor, lit | `#4c4a33` | `#34312d` | `#1b1a1a` |
| Forest floor, shade | `#22231b` | `#1b1a1b` | `#0e0e0f` |
| Dirt road, lit | `#7f705a` | `#6a5650` | `#25242a` |
| Sand, lit | `#93805e` | `#6e5c50` | `#27262a` |
| Rock, lit | `#8a7e6d` | `#625560` | `#252429` |
| Rock, shade | `#383842` | `#2f2a33` | `#131316` |
| Snow, lit | `#d6cfc6` | `#a8949a` | `#3c3f4c` |
| Wall stone, lit | `#9a958d` | `#6e6064` | `#29282e` |
| Wall stone, shade | `#4d4b50` | `#3a353c` | `#141418` |
| Conifer, lit | `#3b4c3a` | `#2c3430` | `#17191c` |
| Conifer, shade | `#1e271f` | `#1a1f1e` | `#0e0f12` |
| Trunk, lit | `#4c3e33` | `#352c2a` | `#1c1a1a` |
| Trunk, shade | `#241e1a` | `#1d1919` | `#0f0e0f` |
| Bush, lit | `#55703a` | `#36402e` | `#191c1c` |
| Torch post, lit | `#6a5340` | `#4c3a32` | `#221d1a` |
| Flame | `#f0dfba` | `#ffb060` | `#ffb468` |
| Torchlight on surfaces | `#ffb060` | `#ff9f50` | `#ffc46a` |
| Water, deep | `#2e3c4a` | `#211f2b` | `#0d0f14` |
| Water, shallow tint | `#5f5c49` | `#655248` | `#28261f` |
| Water, even blue (blue shallows) | `#44597a` | `#383852` | `#141924` |
| Lake bed, lit | `#6b6148` | `#544a42` | `#24231f` |
| Sun disc | `#f4eedc` | `#f0b07a` | `#f4eedc` |
| Moon disc | `#c8ccd6` | `#b8b6c4` | `#c9ccd4` |

**Light per keyframe:**

| | Day | Dusk | Night |
|---|---|---|---|
| ambient, direct | 0.28, 0.80 | 0.30, 0.55 | 0.22, 0.42 |
| cloud shadow, cast shadow | 0.78, 0.92 | 0.25, 0.80 | 0.15, 0.70 |
| haze: distance (m), most | 700, 0.72 | 420, 0.85 | 330, 0.80 |
| torchlight strength | 0.04 | 0.30 | 0.55 |
| flame strength (section 6) | 0.6 | 0.85 | 1 |
| stars | 0 | 0.15 | 1 |

---

## 4. The clamps

Every colour is clamped after light, haze and ink:
- **no channel under 10:** nothing is pure black;
- **no channel over 236;**
- **saturation** (max − min over max) is pulled down to 0.62 at most.

**Light to colour:** a surface sits between its shade and lit colours at light^1.45, so shadows deepen faster than highlights. Rock uses 2.1, for harder faces.

---

## 5. Air, dusk, night and dawn

### Aerial perspective (phase 2a; replaced phase 1's distance haze)

**What it replaced, and why.** Phase 1 mixed every distant surface toward the horizon colour by distance alone: 1 − e^(−d / dist), up to 72% by day. At 1–1.5 km that took everything most of the way to the sky's colour, and took light and dark with it, so the range, the vista's valley and the far shore all read as pale, flat shapes. The reference keeps a far mountain's lit face and shadow side, its snow bright, and cools it without turning it the colour of the sky.

**The rule now** (air 'aerial', the default):
- **Air is thickest low down and thins with height:** its density at height y is e^(−(y − base) / height), with `base` the sea level and `height` 220 m, plus a thin share (`uniform` 0.05) that is the same everywhere, so far land still recedes.
- **A ray's haze is the air it passes through** on its way, worked out in closed form from the eye's height, the ray's elevation and the distance. So looking down from a viewpoint cuts through less of it than looking along the valley floor, and a far mountain's upper slopes stand clearer than its foot.
- **Two shares, not one.** Colour shifts toward the horizon tone by the keyframe's `chroma` share; light and dark close up only by its `lum` share, which stays well short of 1 (0.4 by day, 0.45–0.48 at dusk and dawn). So far colours cool and converge on the horizon tone, while lit and shaded sides, snow, rock, forest and water remain apart out to the view distance.
- **The sea still meets the sky softly:** sea-level air is the thickest, and the far sea's mirror is the sky.
- A reflection is hazed over its own leg up from the water, then the whole cell over the way to the water.
- Clouds keep phase 1's haze rule.
- The settings are each keyframe's `air` and `LOOK.air`.

Phase 1's haze stays behind the air rule 'p1', for comparison.

**Dusk** is purple and orange:
- the sky is purple, with an orange glow round the low sun;
- the haze is thick, at 420 m;
- cloud tops catch the warm light;
- cloud banks (option B) flatten and stretch (`cloudFlat`, `cloudStretch`).

### Night and dawn (phase 2a; replaced phase 1's single night)

**What it replaced, and why.** Phase 1 had one night keyframe with a moon always nearly full, its light so weak (direct 0.42 on near-black colours) that at 23:00 the land was a black screen, and its morning used dusk's colours. In the world, with no torches, there was nothing to walk by.

**The rule now** (night 'moon', the default):
- **The moon has a phase** that follows the day count (a month of 29.53 days; day 0 a bright moon, about day 15 a dark one). Its place follows its phase: a new moon rides with the sun and is down all night; a full moon is opposite it and up all night. The disc is drawn as bright as its lit share, and not at all when new; its glitter on water is as strong.
- **Night is two keyframes**, blended by how much moonlight there is (the lit share times how high the moon is):
  - **moonlit:** enough to walk by. Open ground, water and snow carry a cool, readable light (direct 0.62, ambient 0.26) and soft moon shadows (cast shadow 0.55), through the same shadow sweep and worker-shared arrays as sunlight;
  - **starlit:** under a dark moon, a faint floor (ambient 0.42 on lifted dark colours) so the land is never a black screen; the stars are brighter.
- **The change from sun to moon never flashes.** Sunlight fades out as the sun sets (from 3.4° up to 2° below); moonlight fades in only as the twilight deepens (from 2° to 8.6° below) and as the moon rises. At the moment the light that shades the ground changes from one to the other, both are dark.
- **Dawn has its own keyframe:** cooler blue above and rosier at the horizon than dusk, with a pale lilac morning mist and pink-gold cloud tops.
- **The low sun rakes across the meadow at both ends of the day.** Dawn and dusk have less ambient light (0.22–0.24) and more direct (0.95–1.05) than phase 1's dusk, so slopes facing the low sun stand out from the flat ground.
- 900 fixed stars, projected so they never blink; torches make small warm pools (torchlight 0.55); cloud shadows fade out once the light is low. A star's cell keeps the sky's colour round it (phase 2b): before, it lost the glow round a low sun, so at dawn and dusk the hidden stars showed as blue specks.
- The colours are `LOOK.moonKeys`; the moon's settings `LOOK.moon`.

Phase 1's night stays behind the night rule 'p1', for comparison.

### 5b. Far land (phase 2a; new)

Phase 1 had no rule of its own for far terrain: past a few hundred metres the ground's detail faded, and nothing took its place. Now (air 'aerial'):
- **Large forms are strengthened as fine detail fades.** From 300 m (full by 900 m) the light a surface catches gains contrast about the flat ground's light (`far.form` 0.55), so a far mountain has a clear lit face and a dark shadow side.
- **At dusk the far range is a silhouette** (phase 2b). Far land keeps only a share of the direct light (each keyframe's `light.far`: 0.08 at dusk, 1 otherwise), faded in over the same 300 to 900 m, and dusk's air tone is darker (`#4f4352`), so the range stands dark against the glowing sky instead of showing a pale lit face.
- **Far lit rock stays warm** (phase 2b). Lit ground high up keeps more of its own colour against the air's: the air's colour shift is cut by up to 75% (`far.warm`), by the surface's light and its height from 60 to 260 m above the sea. Far rock stays tan instead of turning cool grey, while low far ground still cools.
- **Rock shows strata and gullies as broad bands.**
  - Gullies are where rain gathers on the range, found from the water's flow, widened to 10–20 m. They darken rock and snow (`far.gully` 0.55).
  - Strata run along the height every 38 m.
  - Both are fixed to the land.
- **The snow line reads as a clear edge.** Past 250 m, snow and rock are decided from the coarser levels' filtered weights, so a snow line or a rock band ends in a clean line instead of breaking into cells. This is blended in over a band, so nothing pops.
- **Forest reads as a dark textured mass:** the air keeps far stands dark, and each tree keeps its own tone and phase 0c's jagged top.
- **A skyline's top cell fades instead of snapping.** The cell just above where the land meets the sky blends land and sky by how much of the cell the land covers, measured from the centre of the cell below to its own. As you turn, the skyline moves through cells smoothly instead of jumping a row. This is the same idea as the far treeline's single-cell tips, for the range.

### The backdrop (phase 2a; new)

Past the north and east edges the range goes on, out to several kilometres, as three receding ridgelines (600 m to 980 m high at the far one), with snow, rock and wooded lower slopes, lit by the same sun. Each ridgeline:
- faces the map, leaning back;
- turns along its line by its own peaks and saddles, so a peak has a lit flank and a shaded one;
- gets haze by the same air as everything else.

It is reflected in water and sits behind nearer clouds. It is never walkable and never part of the height grid. It stands only where the map's own edge is mountainous, and meets the map's mountains with no gap. Its sizes are in `docs/scale.md`.

**Water** mirrors whatever the time of day gives it, by the Fresnel share:
- the glitter path (the sun or moon caught by ripples) is broken by a sparkle fixed to the water;
- torches reflect at night.

### 5c. Weather (phase 2b; new)

**The weather is a pure function** of the world's seed, the day count and the hour, never simulated state, so any moment can be reproduced with the clock frozen. The page works it out (`src/weather.js`) and sends it in the frame as how much of each kind applies, how wet the ground is and how far the clouds have drifted; every layer blends the kinds' numbers in `look.js` by that mix. A frame with no weather is fair.

**Five kinds**, each a set of numbers the existing systems understand (`LOOK.weather.kinds`): how many of the world's clouds are up, how big, flat and long they are and how low; how much direct sun or moon gets through, how much of what is held back returns as soft light from the whole sky, how strong cast shadows and cloud shadows stay; how far the sky, the air and the clouds turn to the keyframe's overcast colour and how bright they stay; how thick the air is and how deep its height profile; how much mist lies; the wind; how hard it rains; how dark and how reflective wet ground is; how bright the night is; how many stars show.

| Kind | What it is |
|---|---|
| **clear** | fewer clouds (under half of fair's), clearer air (0.7), a lighter wind |
| **fair** | exactly the look before weather: the regression set holds it |
| **overcast** | fair's clouds, bigger and flatter, on a grey sky; 12% of the direct light, shadows nearly gone, cloud shadows gone, soft light from the whole sky; air 1.5 times as thick; no sun or moon disc, no stars |
| **rain** | overcast, darker and lower, air 2.6 times as thick and grey, a stronger wind and a rougher sea, the rain streaks, rings on water, wet ground |
| **mist** | fair's light and sky with the mist layer at dawn, a little grey and thicker air (a misty morning is a sunny one above the mist) |

**The forecast** (`LOOK.weather.forecast`): each day is fair or clear (35% clear); 40% of dawns are misty; 22% of the days without rain have an overcast spell of 3 to 7 hours; one day in four rains for one to two hours, after cloud has built for one to two and a half hours, and stays overcast for an hour after. One kind turns into the next over 20 game minutes. Day 0 opens fair, with mist at dawn, so a plain visit opens on the settled look.

**The mist** uses the aerial perspective's own model: a density by height, integrated in closed form along each ray from the eye to what it hits. It lies on a floor that follows the ground smoothed over 160 m and sinks on high ground. Where the ground lies below that floor (a hollow, a valley floor, a lake) the mist lies deep; where it stands above (a knoll, a ridge, the treetops) the mist thins away. So the mist pools in hollows, along rivers and over lakes, and trees and hills rise out of it. It veils what lies behind by 1 − e^(−0.022 d) inside its full depth, and thins above it over 5 m. It thins away as the sun climbs from 5 to 24 degrees, and veils a lake's mirror too. Its colour is each keyframe's `weather.mist`: lilac at dawn, grey by day, blue-grey at night. On a fair or clear day there is none, so it cannot flatten the far range into the sky.

**Rain:**
- **Streaks** are thin glyphs in the near air, fixed to the world round the eye: columns 2.4 m apart out to 26 m, each with a drop every 15 m of height falling at 8.5 m/s, drawn 0.75 m long and slanting with the wind. They wrap as the eye moves and are a pure function of position and time, so turning never makes them swim. They fade with distance into the rain's greying of the air, and show only in front of what the cell's ray hit.
- **On water**, the long ripple dies down by 80%, and near the eye the surface is tilted by many small spreading rings (one in every 0.9 m square every 1.3 s), faded like the ripples by a cell's footprint. Their full tilt changes how much of the surface is mirror; the mirrored and refracted rays take it only up to 0.03 (`rings.tilt`), which the mirrored objects' culling allows for, so the picture never depends on the stripe. Far reflections dull toward the air's colour, broken past what a cell can show. Since rain breaks reflections anyway, they also show less: clouds in them only within 600 m, the land in them followed only half as far, trees mirrored only in water within 40% of the usual distance (`rain.mirror`, all easing back as the rain eases). That keeps Firefox's lake view inside its frame-time limit under rain without touching fair weather.
- **Wet ground** soaks to full within about a quarter of an hour of rain and dries over the hour or so after it. Wet, it is 30% darker (half that on foliage; snow and the bed not at all) and mirrors a little of the horizon's colour at low angles.

**Under overcast and rain** the sun and moon discs fade into the sky round them (with their glitter on water) and the stars go. The moon's light does not get through, so the night is starlit and darker still: less than a clear dark-moon night, never black. Measured as the mean background brightness of the spawn view on a dark-moon night: clear 26.5, overcast 25.4, rain 21.1, against the floor of 10; the world's other cameras fall in the same order.

The weather's colours are each keyframe's `weather` (`cast`, the overcast sky; `mist`; `rain`, the streaks), so every time of day has its own.

---

## 6. Things shrink by fading, never by blinking

The most important rule of the look: **no part may get thinner than about two cells** on screen. Anything thinner falls between rays and blinks as you move.

So everything has a floor that grows with distance (`minR`, the width of a cell at that distance), and detail that would go under the floor fades away instead.

| What | How it gives way with distance |
|---|---|
| Ground detail (patches, fine grain, ragged material edges) | fades as a cell's footprint on the ground grows past its size |
| Meadow patches and tufts (phase 0c) | the same, judged by the footprint along the view, where rows are tallest |
| Ripples | each wave fades as the cell's footprint on the water passes its length, so far water lies calm; the 36 m swell lasts longest |
| Wall merlons | sink into the walkway before they get thinner than two cells |
| Conifer tiers | a tier under about 2–5 rows tall melts into a smooth cone |
| Conifer outline | a crown is at least two cells wide, **except the tip, which tapers to one cell**, so a far treeline keeps a jagged top of single tips; below the tip the crown swells by up to a cell, so a gap between crowns closes before it is thin enough to blink |
| Ragged edges, clumps, notches (treatment B) | fade once a sector of the crown is under about three cells across; a gap cut into a tier closes once it is under about 2.5 rows; a notch closes under two cells |
| Trunks | at least two cells wide; a trunk held wider than it really is darkens toward a quarter of its light, so a far stand's trunks do not read as a fence |
| Torch flames (phase 0c) | at least two rows tall, so they cannot fall between rows; below their true size they fade toward what is behind them, the core bright and the rim fading |
| Bushes | at least two cells |
| Cloud edges | a lumpy band a few cells wide, its width scaled with distance |
| Reflections | the mirrored pass uses the same floors; reflected trees are thinner, so they are checked separately in the flicker set |
| Buildings: thin shapes (phase 3a) | a wall seen end on, a post, a bracket, a beam: held at least two cells across, as trunks are |
| Buildings: merlons | sink into the parapet before they get thinner than about two cells across or tall |
| Buildings: openings | a door, a window, an arrow slit or the gate far off closes once it is under about two cells across or two rows tall, as a notch in a crown does |
| Buildings: stairs | the steps melt into an even slope once a step is under about three rows tall |
| Buildings: lit windows | held at two rows, faded by how much of that is really window, as a flame is |
| Buildings: masonry's courses (after phase 3a) | a course joint darkens each cell by how much of it the joint covers (the joint drawn at least about a row wide), so it slides across the cells instead of blinking; it fades once a course is under two and a half rows, leaving its average darkness. Joints between blocks are kept near: walking sweeps them sideways across the cells, and drawn further they blinked more than the lab's wall |
| Buildings: block joints, framing, shingles, boards, paving | each fades as a cell's footprint on the surface passes its size (a block, a frame bay, a shingle row) |

**Time moves only what should move:**
- the clouds drift;
- the flame flickers;
- the ripples travel;
- the glitter sparkles at 4 changes a second.

- (phase 2b) the weather turns from one kind to the next over 20 game minutes, with the time of day; the rain falls; rings spread on rained-on water; wet ground dries.

Nothing else changes with the clock. **Every variation is a pure function of world position or of an object's own identity, never of screen position or time.** So nothing crawls or reshuffles when you walk or turn, and a frozen clock repeats exactly. The weather is no exception: it is a pure function of the seed, the day and the hour (section 5c).

---

## 7. Materials and objects

### Terrain

| Material | Where | Built from | With distance |
|---|---|---|---|
| Grass | open ground (the meadow) | lit/shade by sun and shadow; tone from patches 11 m across and fine grain; meadow mottling, strength 2 | detail fades; haze |
| Forest floor (0c) | under and just round tree crowns | its own darker, browner ladder; shaded by the same shadow sweep as everything else, so it agrees between workers and with the clock frozen | as grass |
| Dirt road | the road | ragged edge from fine grain | edge smooths |
| Sand | beaches, river banks | as dirt | |
| Rock | steep or high ground | strata bands along height | bands fade |
| Snow | the high tops | | |
| Water, bed | lake, river and sea | three records: surface, reflection, bed (section 5) | ripples fade |

**In the generated world (phase 1)** the ground uses only these materials, from the world's data:
- meadow everywhere it is not something else;
- forest floor under and round the stands;
- sand on beaches (low, gentle ground within about 34 m of the sea), in a strip round lakes and along rivers, and on the shallow beds next to them;
- rock on faces steeper than about 32 degrees and on steep ground high in the range;
- snow on the tops, from 235 m above the sea, not on the steepest faces; phase 2b judges a point lower by how far it stands above the ground within 160 m round it (`SCALE.range.snowRelief`), so a crest just over the line stays bare instead of wearing a thin white line, and snow lingers in the hollows;
- dirt on the roads, pressed level across their width;
- bed under lakes and rivers, seen through the water.

There is **no marsh**: it would need a material, colours and a ladder the bible does not have (wet ground between grass and water), so it waits for a phase that adds them here first.

**The sea runs to the horizon.** Past the map's edge the edge's sea goes on, and past the view distance a ray that comes down to sea level over open sea meets a surface whose mirror is the sky. It never ends in a line.

**The coast (phase 2a).** All of it is a pure function of world position and time, so a frozen clock repeats exactly:
- **Wet band:** where sand meets the sea a darker wet band 2.2 m wide, drawn in the bed's colours wherever it covers most of a cell's footprint, so far off it thins away. At a lake (phase 2b) it is the ground up to 5 cm above the water, so it follows how gently the shore slopes: 0.5 m at most on a gentle shore, a few centimetres on a steep bank, where it vanishes.
- **Foam line:** a broken foam line in the water (the `foam` material) runs up toward the shore and back over 9 s (6 s, and fainter, at a lake). It covers a cell by the share of its footprint the line covers, so thin foam fades with distance instead of breaking into dashes.
- **Swell:** the open sea has a gentle swell running onshore, faded like the ripples as a cell's footprint passes its length.
- **Beaches** are narrower than in phase 1, about 16 m (34 m before).

The settings are `LOOK.coast`.

Shading:
- terrain is lit by its interpolated normal;
- cast shadows come from one sweep over the grid toward the light (terrain, walls, tree crowns, bushes). On the big map it is spread over frames.
- cloud shadows are a soft, drifting field 8–32 m across.

### Conifers

**Every tree is its own:** height, crown width, bare-trunk share, trunk width and bark tone, lean, tier count and foliage tone all come from its identity. About one tree in seven stands a third taller, so a stand has an uneven top.

The shape: a bare trunk under a stack of overlapping cone tiers, each wide at its foot and narrow at its top (a sawtooth outline), with a ragged edge that turns with the angle round the trunk.
- Seen from below, a tier's flat underside is darker toward the trunk.
- Deep in a close stand, crowns grow narrower, so a closed canopy keeps gaps to the sky.
- **The tidy tiers (treatment A), the only treatment since after phase 3a:** the tiered shape as in phase 0b, with the per-tree variation above and a ragged outline in 9 sectors. Treatment B (rough and dark: tiers shifted off the axis, some cut short, some notched, a deeper outline, foliage in clumps, 28% less light) was the settled look from phase 1 to phase 3a; Martin asked for the tidy tiers instead, and the choice is gone from the look panel and the URL.

### Other objects

- **Bushes:** a squat ellipsoid with a lumpy outline, at least two cells.
- **Torch:** a post and a flame. By day the flame is a small pale light (`flameStrength` 0.6, `#f0dfba`), at night warm and full. It lights the ground within 11 m.
- **Wall (the lab):** spans of stone on the grid, with merlons that sink with distance; the gate is an arch. The generated world's fort is built from the kit instead (below).

### Buildings (phase 3a)

Every structure is made from one kit of pieces, described as data (`src/world/kit-pieces.js`) and built from exact shapes (boxes, cylinders, gable prisms, stairs, panes) that can stand at any angle and have openings cut through them (`src/world/kit.js`). The same shapes are drawn, cast shadows, are walked on and are checked by the tools. Why exact shapes and not spans: `docs/phase3a.md`.

**The pieces:**
- **Curtain wall:** 6.5 m to its walk, 3.2 m thick; the walk is 2.6 m wide behind a 0.6 m parapet, crenellated outward (merlons 1.4 m, gaps 0.9 m, 1 m tall over a 1 m breastwork).
- **Gate:** a block 10 m along the wall with an arched passage 3.6 m wide and 7.4 m deep through it, torches at its mouth and inside it.
- **Towers:** square (half width 4.4–4.9 m, turned square to its walls, which leave through the middles of two faces) or round (radius 3.7–4.3 m), 3 m above the walk; a doorway from the yard at the base, a stair inside to a floor at the walk's height with doors onto both walks, and a hatch to the open, crenellated top; a window lit at night.
- **Keep:** one hall 5 m high, against the far wall, 6 m above the walk; a door from the yard, windows lit at night.
- **Stair to the walk:** solid stone steps against the wall's inside face.
- **Timber building:** a framed house (posts and beams with plaster between), a shingle roof, a door.
- **Well, torch on a bracket or post, lit window.** The well's shaft is drawn dark, nearly black at every hour, 20 cm under its rim, so looking in shows a hole and not the ground (after phase 3a).

**The materials** (colours by keyframe in `look.js`; after phase 3a the fort's dressed stone is its own material, `masonry`, paler than the lab wall's stone and the tan rock, and its joints darken it more):

| Material | Glyphs | Day, lit / shade | Dusk, lit | Night (bright moon), lit | With distance |
|---|---|---|---|---|---|
| Dressed stone (`masonry`) | `:=#▒▓█` | `#b8ae9c` / `#56524f` | `#857373` | `#52535b` | the courses' joints stay dark while a course is at least two and a half rows tall, drawn by how much of each cell they cover, then fade to their average darkness by one and a half; the joints between blocks fade with the footprint (about 15 m), and the blocks are one tone |
| A well's shaft (`shaft`) | ` .:` | `#1b1817` / `#141211` | `#1a1718` | `#121214` | nearly black at every hour |
| Timber | `.-=#H` | `#6e573f` / `#30261e` | `#4f3d31` | `#302b23` | posts and beams held two cells; framing fades |
| Plaster | `.,:;=` | `#b3a994` / `#575450` | `#806d69` | `#504f52` | plain; goes with the frame's fading |
| Shingle roof | `:^=#%` | `#6d625a` / `#2d2a2c` | `#4d424f` | `#363641` | shingle rows fade |
| Packed-earth yard | `.,:-=` | `#8a7a64` / `#403830` | `#735e59` | `#40424d` | as the dirt road; no meadow tufts on it |
| Lit window | `:=#▓` | dark by day (`#24201d`), lit `#e2a65e`–`#eeaa5e` from dusk | strength 0.8 | strength 1 | held at two rows and faded, as a flame |

Each also has a dawn, a starlit (dark moon) and phase 1's night colour (`look.js`, keyframes `dawn`, `starlit`, `night`).

**Light inside:** a surface inside a room or the gate's passage takes the sky's soft light only by the share its doorways, windows and open tops let in, and darkens toward 0.42 of itself where none comes in (`LOOK.interior`). A torch there lights it at least at strength 0.32, even by day, so an interior is dark but reads by its openings and its torches. Torchlight reaches only surfaces sharing its zone (outside, the yard, or one room), so a torch never lights through a wall, and a torch's cost depends only on the shapes near it.

**At night** the fort's torches and lit windows are small warm points from afar (held at two rows, faded by how much of that they really are); near, the torches light the stone and the ground round them and show in the lake.

**The fort's site:** the platform is levelled to the ground's median under it, with banks of 1 in 2.4 round it, or moved toward the road's height by up to 2.5 m where the road could not otherwise come in at a gentle grade; trees and bushes are cleared from it and 24 m beyond its walls; the road runs straight in through the gate's passage, graded evenly. Since phase 3b the road winds up to the gate: it leaves the old road where its length covers the climb at a gentle grade, clears the towers, turns without hairpins and meets the old road without a kink; a road that would pass through the fort goes round it.

### Villages and bridges (phase 3b)

Three villages on every seed, each composed from the kit (`src/world/kit-village.js`) by a generator (`src/world/gen/village.js`), never stamped: one strung along its road, one round a green with its well and market shelter, one on the shore with a jetty and its houses facing the water. Each has 8 to 20 houses of mixed kinds (cottage, larger house with an upper storey), angles, setbacks and roofs, a chapel, a well, one or two barns at its edge, lanterns at its centre and at its bridge or jetty, lit windows in most houses, and a signpost where its road meets the main road. Houses sit on rubble footings that take the slope; a house that would need more than 1.2 m of footing, or whose door would open onto a drop, is moved or dropped, never forced. Round each village lie fields in strips along the contour, bounded here and there by fences and dry-stone walls with gate gaps, and footpaths to the fields, the water and the nearest viewpoint. Bridges carry the main roads over rivers: timber over narrow crossings, stone with one to three arches over wide ones.

**The materials** (the same columns as the fort's table above; all within the muted palette, each a shift of a colour already in it):

| Material | Glyphs | Day, lit / shade | Dusk, lit | Night (bright moon), lit | With distance |
|---|---|---|---|---|---|
| Thatch | `:;=%#` | `#857048` / `#403526` | `#6f5640` | `#3e3d37` | coarse courses (0.4 m) by how much of the cell they cover; the streaks only while four columns wide |
| Plaster, warm (`plaster2`) | `.,:;=` | `#b7a27c` / `#595143` | `#836958` | `#524c45` | plain; its mottle only while a patch is four columns wide |
| Plaster, rose (`plaster3`) | `.,:;=` | `#ae9882` / `#544c46` | `#7c625c` | `#4e4748` | as above |
| Timber, dark (`timber2`) | `.-=#H` | `#584635` / `#261e19` | `#3f3129` | `#26221d` | boards by their own tones while five columns wide, no gaps |
| Timber, pale (`timber3`) | `.-=#H` | `#795939` / `#35271b` | `#573e2c` | `#352c20` | as above |
| Crop | `,:;"+*` | `#76873a` / `#2f3724` | `#404532` | `#3f4944` | furrows (0.9 m) box filtered, fading with the footprint |
| Stubble | `.,:;=+` | `#967d51` / `#483b2a` | `#7d6048` | `#46443e` | as crop |
| Fallow | `.:-=+#` | `#725e48` / `#372d26` | `#5f4840` | `#353337` | as crop |

The villages' and bridges' stone is the fort's dressed stone (`masonry`) with its course joints, but without the joints between blocks: the blocks differ a little in tone near instead. Their paving and shingle roofs are drawn the same way: what walking or turning would sweep across the cells faster than it is wide (a joint between blocks or slabs, a gap between boards, a post narrower than four columns, a tile narrower than five) is left out or faded, and the surface keeps its average darkness. A bridge's parapets are plain dressed stone. The fort keeps its own textures, unchanged.

**Strips and fields:** a strip's own material shows while the strip is at least three cells across; further off a field shows its main kind, so far strips cannot break into blinking cells.

**Footpaths and the worn yard:** drawn as dirt, 1.4 m wide (2.6 m across the fort's yard), faded at their edges and only near; further off they are part of the meadow.

**At night:** lanterns (as the fort's torches, on posts) at each village's centre, at its jetty and at both ends of each bridge; lit windows in most houses; a hearth's fire inside a house one can enter. From each village's viewpoint its lights must be visible at night (`tools/world-check.mjs`).

### Sky

- the gradient from horizon to high, with a glow round the sun;
- sun and moon discs at least 1.2 cells;
- 900 stars.
- **Clouds A (cumulus):** clusters of spheres of varied sizes, cut flat underneath, bright tops and grey undersides that are lighter at the rim. Kept in the look panel for comparison only.
- **Clouds B (banks), the settled look:** long broken bands of stretched puffs turned to the band's angle, with streaks along the edge; flatter and longer at dusk.
- In the generated world the clouds are spread over its whole sky from the seed (about a kilometre apart, some places left clear), not only where the lab's valley looked.
- A puff's dissolving edge in front of the same cloud's body is not a hole.

### The overhead map (M)

The map is drawn in the same glyph cells, by the same resolve step and day palette, as the view: each cell gets a hit record for what lies under it, seen from straight above and lit by the day's sun from its slope (water, forest, road, snow, rock, sand or meadow). Only its marks are its own, set in `look.js` (`map`): `#` the fort's walls (all the way round, phase 3a), `o` village sites, `*` viewpoints, `+` the spawn, and `@` the player with two cells of `| / - \` pointing their way, in a pale cream (the player in torch orange) on a dark cell.

---

## 8. Never do this

From the first build's retrospective and from what went wrong in phases 0a and 0b.

**Choosing glyphs and colour:**
1. **Never pick a glyph from the finished colour or pixel brightness.** Material picks the family, light the rung.
2. **Never use pure black or an unclamped channel.** An unclamped multiply once turned the first build's sky yellow.
3. **Never set a colour, glyph or strength outside `look.js`.**
4. **Never make the palette saturated or bold.** The first build's "bolder colours" moved it away from the reference; the reference is muted and close in value.
5. **Never draw waves as glyphs.** Ripples tilt the rays; they draw nothing themselves.

**Steadiness:**

6. **Never sample the ground at fixed distances from the eye.** Sample where rays cross the grid's lines, so samples are fixed to the land (the first build's main source of flicker).
7. **Never let anything depend on screen position or the clock** unless it is meant to move. Variation comes from world position or an object's identity.
8. **Never let a part get thinner than two cells** (a tip may taper to one). Fade it instead.
9. **Never let a cell's result depend on which stripe it is in.** This found three bugs:
   - phase 0b's water level that depended on a stripe's rows;
   - a conifer's culling bounds that were too small;
   - anything reading a neighbouring column must stay inside its own column.

**Distance:**

10. **Never let a distant light stand out as a block.** Phase 0b's flames, held at their minimum size at full brightness, read as yellow beacons even by day.
11. **Never let a far stand become a rectangle.** It keeps a jagged top of tips, then softens into a ragged band.
12. **Never light the ground under trees as open meadow.** It is forest floor, in the crowns' shadow.

**Engine and process:**

13. **Never trust stills alone.** Flicker and crawl show only in motion: run the flicker tool and record walk videos.
14. **Never benchmark with another copy of the game open** (the Claude app's browser pane included), or on a busy machine. WebKit is measured headless.
15. **Never give the canvas a fractional CSS size** (WebKit drops to 3 fps), and never use the font's own shade blocks at small sizes.
16. **Never decide the look late, or from concept art.** Compare candidates rendered by the real engine in the real world: that is what the look panel is for.
17. **Never let an object's cost scale with its whole screen box.** Cull exactly and work per plane, as the conifer pass does. The first build's market stalls cost 2 ms because they did not.
18. **Never show frames at uneven delays, or move the camera by a wobbling clock.** A frame shows the camera as it was when it was asked for. If some frames reach the screen a refresh later than others, turning stalls and then jumps. So every frame is shown the same number of refreshes after it was asked for, at a steady rate, a late frame is dropped rather than shown late, and time moves in whole display refreshes (`src/app/pace.js`). `tools/smooth.mjs` measures it.
19. **Never judge terrain from the overhead map.** Height noise that looks gentle on a map is usually far too steep at eye level. The generated world is judged by the sky test (`tools/world-check.mjs`: at eye level the median frame is at least 35% sky, and under one view in ten has less than 15%) and by standing in it.
20. **Never simulate the weather** (phase 2b). Every part of it, the mix of kinds, the wetness of the ground and the clouds' drift, is worked out from the seed, the day and the hour, so a frozen clock repeats exactly and every thread draws the same picture.
21. **Never let anything on screen but the picture into a tool's frames** (phase 2b). The tools run with the menu, the hint and the start card suppressed from the first frame (`tools/lib/serve.mjs`).

**Buildings (phase 3a):**

22. **Never lock a building to the grid.** Pieces stand at any angle and their outlines are exact; a turned wall drawn as 1 m columns steps and crawls as you walk past it.
23. **Never let collision and the picture disagree.** Walking, shadows and drawing read the same shapes; a walker must never pass through a wall, stand inside one, get stuck or fall through a floor, and `tools/world-check.mjs` walks every place and a thousand random walks to prove it.
24. **Never let an opening or a thin part blink.** A door, a window or the gate far off closes before it is two cells across; a post or a wall end on is held at two cells; merlons sink; masonry, framing and shingles fade with the footprint. Large flat walls at eye height are checked for moiré at every density.
25. **Never light an interior from the open sky.** Inside, light comes by doorways, windows, open tops and torches only, so a hall is dark but readable; and a torch never lights through a wall (zones).
26. **Never place a door where the floor is not.** Every doorway opens onto something to stand on at its sill, in line with the walk or path that reaches it (phase 3a's square towers once clamped a walk door off the walk, over a stairwell).
27. **Never leave a cliff, a trench or a floating base round a building.** Its platform is levelled with gentle banks, and its road meets its gate without a step.

**Villages and bridges (phase 3b):**

28. **Never draw a thin line that walking or turning sweeps across the cells faster than it is wide.** At a walk a wall's detail slides about 0.075 m a frame, and turning moves everything about two columns a frame, so a joint, a board's gap or a narrow post shows in one frame and is gone in the next however it is filtered. Leave it out, or draw it only while it is several frames' travel wide, and keep the surface's average darkness. The flicker tool (`--buildings --bymat`) finds them.
29. **Never stamp a village.** It is composed from the land: its pattern, its houses' kinds, angles, setbacks and roofs come from the seed and the ground, and every place is checked for overlaps with roads, rivers, the fort and each other.
30. **Never force a house onto a slope.** Its footing takes at most 1.2 m of fall and its door opens onto firm ground at its sill; otherwise the house moves or is left out. Regenerate from data; never move a house by hand.
31. **Never let two surfaces cross nearly level.** Where a bridge's deck runs over the bank under its road, the ground is pressed well under the deck, so the two do not cut each other in a ragged, crawling line.

---

## 9. Settled choices

Locked at the start of phase 1 (10 Oct 2026), from phase 0c's candidates. They are the defaults in `look.js` (`choices`); the look panel (L) and the URL (`?cloud=A&meadow=0&shallows=warm`) still show the others, for comparison, until a later phase removes them. (The conifers' choice was removed after phase 3a, 12 Oct 2026: only the tidy tiers are kept, at Martin's request.)

| Choice (key) | Settled | Why |
|---|---|---|
| Conifers (7, removed after phase 3a) | ~~B, rough and dark~~ **A, the tidy tiers** since after phase 3a (Martin's choice) | The reference's conifers are dark, rough and uneven: broken outlines, sky showing through, clumped needles. A is a clean version of the same tree and still looks drawn. B costs about 3% more than A in a forest and blinks no more than phase 0b walking; turning inside a forest it crawls more than phase 0b did, which Martin accepted. |
| Clouds (8) | **B, banks** | The reference's clouds are irregular banks and broken bands, flatter and longer at dusk. |
| Meadow (9) | **2, strong patches** | The reference's meadow is mottled in large soft patches several metres across; strength 1 is barely visible at density 3. |
| Shallows (0) | **blue, even blue** | The reference's near water is an even blue with no bed showing. |

Also accepted from phase 0c: the forest-floor material, and narrower crowns in dense stands.

**Phase 2a's rules** are the defaults too, with phase 1's kept beside them in the look panel and by URL for comparison:

| Rule (key) | Default | Phase 1's, for comparison |
|---|---|---|
| Distance (5) | **aerial**: aerial perspective, the far-land rules and the backdrop (sections 5 and 5b) | `?air=p1`: haze by distance alone, no backdrop |
| Night (6) | **moon**: the moon's phases, moonlight and starlight, dawn, the low sun raking (section 5) | `?night=p1`: one dark night, dusk's colours at dawn |

The reasons and measurements are in `docs/phase0c.md`. The regression set was saved again with these defaults in phase 1 (`docs/phase1.md`), and again in phase 2b after the five look fixes, with the weather held at fair (`docs/phase2b.md`).

**Phase 2b's weather** is automatic by default (the forecast); the menu (Esc, World) holds any one kind.
