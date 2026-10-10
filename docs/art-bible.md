# Land of Ascii v3: the art bible (draft)

Draft of 10 Oct 2026, written in phase 0c. This is the set of rules every later phase has to obey. It records the rules the look already follows (phases 0a and 0b) and the ones phase 0c adds.

Three things hold it together:
- **`src/look.js` is the only place** where colours, glyphs, ladders and strengths are set. Renderer code reads it and never hard-codes a colour.
- **The tools hold it in place.** `tools/lookbook.mjs --regress` compares the twelve fixed cameras cell for cell with a saved set. `tools/flicker.mjs` turns blinking into a number. `tools/identity.mjs` proves the picture is the same whatever the number of workers.
- **The open choices** at the end are decided by Martin, by eye, in the look panel (L).

---

## 1. What a cell carries

The picture is a grid of monospace cells, twice as tall as wide: about 40,000 at the default density (3) and 52,480 at the top one, at 1440 × 900.

**A cell is one glyph on a background:**
- the **background** carries the surface's colour under the light that reaches it;
- the **glyph** is a tint of the same colour, a little darker on lit ground and a little lighter in the dark;
- the cell carries no outline and no second material. Colour does most of the work; the glyph adds grain.

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

**Haze fades glyph contrast** with the same distance as the colour (`glyphFade` 0.9), so distant land is calmer.

**Cloud edges** are the one place a cell shows two things: the sky behind as the background and the cloud as a shade block (░ ▒ ▓) over it. The edge dissolves without a hard outline.

The atlas draws the shade blocks itself, because fonts get them wrong at small sizes.

---

## 3. The palette

Colours are named by their role. Three keyframes are blended by the height of the sun, so time can run between them:
- day is full once the sun is above 16°;
- night is full once it is 13° below the horizon.

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

## 5. Haze, dusk and night

**Haze.** The share of the haze colour mixed in at distance d is 1 − e^(−d / dist), times the keyframe's most. It mixes toward the horizon colour of the time of day, so distant ridges sit in the sky, not on it. Glyph contrast fades with it.

**Dusk** is purple and orange:
- the sky is purple, with an orange glow round the low sun;
- the haze is thick, at 420 m;
- cloud tops catch the warm light;
- cloud banks (option B) flatten and stretch (`cloudFlat`, `cloudStretch`).

**Night is properly dark:**
- the moon is the light (direct 0.42, ambient 0.22);
- 900 fixed stars, projected so they never blink;
- torches make small warm pools on the ground, walls and water (torchlight 0.55);
- cloud shadows fade out once the light is low.

**Water** mirrors whatever the time of day gives it, by the Fresnel share:
- the glitter path (the sun or moon caught by ripples) is broken by a sparkle fixed to the water;
- torches reflect at night.

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

**Time moves only what should move:**
- the clouds drift;
- the flame flickers;
- the ripples travel;
- the glitter sparkles at 4 changes a second.

Nothing else changes with the clock. **Every variation is a pure function of world position or of an object's own identity, never of screen position or time.** So nothing crawls or reshuffles when you walk or turn, and a frozen clock repeats exactly.

---

## 7. Materials and objects

### Terrain

| Material | Where | Built from | With distance |
|---|---|---|---|
| Grass | open ground | lit/shade by sun and shadow; tone from patches 11 m across and fine grain; meadow mottling (option) | detail fades; haze |
| Forest floor (0c) | under and just round tree crowns | its own darker, browner ladder; shaded by the same shadow sweep as everything else, so it agrees between workers and with the clock frozen | as grass |
| Dirt road | the road | ragged edge from fine grain | edge smooths |
| Sand | beaches, river banks | as dirt | |
| Rock | steep or high ground | strata bands along height | bands fade |
| Snow | the high tops | | |
| Water, bed | lake and river | three records: surface, reflection, bed (section 5) | ripples fade |

Shading:
- terrain is lit by its interpolated normal;
- cast shadows come from one sweep over the grid toward the light (terrain, walls, tree crowns, bushes). On the big map it is spread over frames.
- cloud shadows are a soft, drifting field 8–32 m across.

### Conifers

**Every tree is its own:** height, crown width, bare-trunk share, trunk width and bark tone, lean, tier count and foliage tone all come from its identity. About one tree in seven stands a third taller, so a stand has an uneven top.

The shape: a bare trunk under a stack of overlapping cone tiers, each wide at its foot and narrow at its top (a sawtooth outline), with a ragged edge that turns with the angle round the trunk.
- Seen from below, a tier's flat underside is darker toward the trunk.
- Deep in a close stand, crowns grow narrower, so a closed canopy keeps gaps to the sky.
- **Treatment A (tidy):** the tiered shape as in phase 0b, with the per-tree variation above.
- **Treatment B (rough and dark):**
  - tiers shifted off the axis;
  - a third of them cut short, so sky or trunk shows above;
  - some notched;
  - a deeper ragged outline in 13 sectors;
  - foliage tone in clumps;
  - 28% less light.

### Other objects

- **Bushes:** a squat ellipsoid with a lumpy outline, at least two cells.
- **Torch:** a post and a flame. By day the flame is a small pale light (`flameStrength` 0.6, `#f0dfba`), at night warm and full. It lights the ground within 11 m.
- **Wall:** spans of stone on the grid, with merlons that sink with distance; the gate is an arch.

### Sky

- the gradient from horizon to high, with a glow round the sun;
- sun and moon discs at least 1.2 cells;
- 900 stars.
- **Clouds A (cumulus):** clusters of spheres of varied sizes, cut flat underneath, bright tops and grey undersides that are lighter at the rim.
- **Clouds B (banks):** long broken bands of stretched puffs turned to the band's angle, with streaks along the edge; flatter and longer at dusk.
- A puff's dissolving edge in front of the same cloud's body is not a hole.

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
18. **Never show frames at uneven delays.** A frame shows the camera as it was when it was asked for. If some frames reach the screen one refresh later and others two, turning stalls and then jumps. Every frame is shown the same number of refreshes after it was asked for, at a steady rate (`src/app/pace.js`); `tools/smooth.mjs` measures it.

---

## 9. Open choices

Each is a setting in `look.js` (`choices`), switched live in the look panel (L) and by URL. The defaults today are A, A, 0, warm: phase 0b's look, plus the three fixes. Once Martin locks a combination, the losing options go, and the regression set is saved again.

**Recommended combination: conifers B, clouds B, meadow 2, shallows blue.** One URL shows it: `?tree=B&cloud=B&meadow=2&shallows=blue`. The reasons for each choice, and the measurements behind them, are in `docs/phase0c.md`.

| Choice (key) | Options | Recommendation | Why |
|---|---|---|---|
| Conifers (7) | A tidy tiers · B rough and dark | **B** | The reference's conifers are dark, rough and uneven: broken outlines, sky showing through, clumped needles. A is a clean version of the same tree and still looks drawn. Walking, B blinks no more than phase 0b; turning inside a forest, both A and B crawl more than phase 0b did, because the canopy now has gaps. B costs about 3% more than A in the forest. |
| Clouds (8) | A cumulus · B banks | **B** | The reference's clouds are irregular banks and broken bands, flatter and longer at dusk, not round puffs. B blinks no more than A or phase 0b and costs about the same. |
| Meadow (9) | 0 none · 1 soft patches · 2 strong patches | **2** | The reference's meadow is mottled in large soft patches several metres across. Strength 2 is the nearest; 1 is barely visible at density 3. It blinks least of the three, walking and turning, and holds still in the walk videos. |
| Shallows (0) | warm bed · even blue | **blue** | The reference's near water is an even blue with no bed showing. The warm bed was our reading of phase 0b's brief, not the reference. |
