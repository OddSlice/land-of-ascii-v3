# Scale

The numbers the generated world is built to, and the reasons for them. They live in code in `src/world/scale.js`; change a number there and here together. Distances are metres, speeds metres a second, and slopes rise over run (so 12% is 0.12, and 45 degrees is 1.0).

Measured figures come from the default world (seed 3), built by `src/world/gen/world.js`.

## The map

| | | |
|---|---|---|
| Size | 2048 × 2048 cells, one metre each, no wrapping | Large enough for many minutes of walking with the edges out of sight, and small enough to build in under 4 s and keep under 300 MB. |
| Sea level | 20 m above the datum | The datum sits under the deepest sea bed, so no height is negative. |
| View distance | 1,500 m | Across the lowland to the range. Beyond it, the sea plane is drawn to the horizon, so the coast never ends at an edge, and past the north and east edges the backdrop stands (below). |
| Mountains | close the north and east; about 300 m above the sea at the top, snow from 235 m (phase 2b: judged lower by how far a point stands above the ground within 160 m round it, so crests just over the line stay bare) | A backdrop you walk toward, not terrain you walk through. The range front lies about 430 m in from those edges. Past it the peaks climb between 70 and 390 m in, steeper toward the back (phase 2a: as far as the sky test allows), and even out into a shoulder about 205 m high at the edge. The backdrop goes on beyond. |
| Sea | closes the south and west; the shore lies about 240 m in | Beaches on low, gentle ground within about 16 m of the sea (34 m in phase 1); low cliffs along some stretches. |

Seed 3 is 23% sea, 3% lakes, 1% rivers and 73% land (41% lowland, 32% range). Its highest point is 252 m above the sea, against 244 m in phase 1. Seeds 1, 2, 4 and 5 reach 317, 300, 326 and 291 m (302, 287, 314 and 284 in phase 1). 1.25% of it is snow (2.6% in phase 2a: the crests just over the snow line are bare now, phase 2b) and 7% bare rock.

## The backdrop (phase 2a)

The range goes on past the north and east edges as three receding ridgelines: never walkable, never part of the height grid, drawn where a ray has met nothing on the map. Each runs at a set distance outside the edges and rounds the north-east corner on an arc; heights are above the sea.

| Ridgeline | Outside the edges | Heights (saddles to peaks) | Peaks apart | Snow from | Trees below |
|---|---|---|---|---|---|
| 1 | 450 m | 200–580 m | about 1.1 km | 480 m | 210 m |
| 2 | 1,400 m | 320–840 m | about 1.7 km | 620 m | 220 m |
| 3 | 3,200 m | 440–980 m | about 2.6 km | 700 m | 230 m |

- From the spawn, the far ridgeline stands about 4.5 km away. From the south coast it is about 5.5 km away.
- Snow caps a peak above its line by 55% of its height over it, so taller peaks carry more and the snow line follows the peaks; it runs down the gullies.
- The ridgelines stand only where the map's own edge beside them is mountainous: at full height where the edge, smoothed over 900 m along it, is 210 m above the sea, and nothing where it is 110 m.
- The march runs the map's edge on past it as far as the first ridgeline wherever that ridgeline stands above it, so the two meet with no gap.
- Seed 3's ridgelines reach 375, 698 and 659 m: the far one is lower there, where the map's edge beside it is less mountainous. Seeds 1, 2, 4 and 5 reach 431–513, 569–653 and 792–814 m.
- They cost one test per ray against three heights, worked out once per column.

## The body

| | | |
|---|---|---|
| Eye height | 1.7 m above the feet | An adult's eye. Trees, wall and road read at true size against it. |
| Walking speed | 4.5 m/s, measured along the ground | Brisk game walking: real walking is about 1.4 m/s, which is too slow for a world this size. Measured along the slope, so hills neither speed you up nor slow you down on the map. A building's steps are walked at the same speed across the map (after phase 3a), and the eye glides over each step in about a tenth of a second. |
| Running speed | 8 m/s (Shift) | |
| Wading | slows smoothly to 45% of walking speed at chest depth | |
| Swimming | 1.2 m/s, past chest depth (1.3 m of water), with the eye 0.15 m above the surface | |
| Flying | 50 m/s (F) | For looking round the world. Space climbs. |
| Jumping | about 1.1 m (Space), not while swimming | After phase 3a. A game's jump, not a person's: enough to get onto a parapet's 1 m breastwork from the walk and out through a crenel. Any edge can be stepped off; falling does no harm. |
| Climbing | nothing steeper than 45° (1.0) can be walked up | |
| Sliding | ground steeper than 50° (1.19) slides you down at 6 m/s | |
| Falling | does no harm | |

## Time to cross

| | walking | running | flying |
|---|---|---|---|
| One side (2,048 m) | 7.6 min | 4.3 min | 41 s |
| Corner to corner (2,896 m) | 10.7 min | 6.0 min | 58 s |
| Spawn to the fort, by road (seed 3, 711 m) | 2.6 min | 1.5 min | |
| All the roads (seed 3, 2,240 m) | 8.3 min | 4.7 min | |

## The land

| | | |
|---|---|---|
| Lowland relief | a few metres over tens of metres: long shallow rises and broad valleys, usually no steeper than 8% | The old build failed on steep terrain (research section 4). Seed 3's lowland, measured over 10 m: median slope 4.9%, 75th percentile 8.2%, 90th 16.5% (knolls and lake rims), 99th 29.5%. |
| The sky test | at eye level the median frame is at least 35% sky, and under one view in ten has less than 15% | How the terrain is judged (art bible, never-do 19): `tools/world-check.mjs`. |
| Rivers | 3 to 14 m wide; 2 or 3, rising in the mountains | Seed 3: three rivers, 2.3, 1.8 and 1.3 km long, from 211, 154 and 194 m above the sea. |
| Fords | water no deeper than 0.6 m where a road crosses | Below the knee; well short of chest depth. |
| Lakes | filled hollows at least 1,500 m² and 0.7 m deep | Seed 3: a main lake of about 10 ha, 14 m above the sea, and four small ones. |

## Things on the land

| | | |
|---|---|---|
| Trees | about 12,000 conifers, in stands on a jittered 5 m lattice, and (phase 2a) in copses | Seed 3 has 11,843 trees (417 of them in copses) and 503 bushes. |
| Copses (phase 2a) | up to 32 small clumps of 5 to 30 conifers, 4.5 m apart, in the open lowland at least 140 m apart, clear of the stands, water, shore and range | Something to walk toward in the middle of the map. Seed 3 has 31 copses. |
| Tree height | 11 to 24 m for most trees; a few emergent trees reach about 36 m | Seed 3 median 19.4 m. Mature spruce and fir height, so a stand edge stands well above the eye across a meadow. |
| Roads | dirt, 4 m wide, flattened across their width; steepest 12% | A cart track. The path search refuses 4 m steps steeper than 7.5% and loosens only where it must (9, 11, 14, then 20%). The laid road is graded to 9.6% and never cut or banked more than 1.5 m. `world-check.mjs` measures each road along its length over 4 m. |
| The wall | 120 m long, 3 m thick, 6 m high, with merlons 1.5 m high and a gate 4 m wide | The 0A wall. Since phase 3a only in the lab; the generated world has the fort (below). |

## Sites

- **Spawn:** on a road, on a low rise (9 m above the ground around it on seed 3), facing the main lake, with forest to one side and the range behind.
- **Fort:** on a rise near the main lake (on seed 3, 172 m from it and 12 m above its surroundings). Since phase 3a the site must be seen from the spawn, over the land and the forest: the keep's top or a tower's (the next best site if not; any site if none is). 14 of 65 seeds checked moved their fort for it; seed 3's did not.
- **Villages:** three, on flat ground near water; since phase 3b each is built (below), one of each pattern.
- **Viewpoints:** four, on high ground with long views, each moved (phase 2a) to the brow of its hill: within 90 m, no more than 18 m lower, where the ground falls away soonest in the direction it looks, so its own slope does not fill the view (on seed 3, 205, 195, 219 and 35 m above the sea).

## Buildings (phase 3a)

The building kit's sizes, in `SCALE.kit`. Heights are above the ground a piece stands on (the fort's platform).

| | | |
|---|---|---|
| Curtain wall | walk 6.5 m up, 3.2 m thick, foundation 2 m deep; parapet 0.6 m thick on the outer side, breastwork 1 m above the walk, merlons 1 m above that, 1.4 m long with 0.9 m gaps | A walk 2.6 m wide, so two can pass. At 6.5 m the walk looks over the trees' lower crowns and the yard is hidden from outside. |
| Gate | a block 10 m along the wall; its passage 3.6 m wide and 7.4 m deep, the arch springing at 3.2 m (crown at 5 m) | Deep enough to feel like going through, not past; a cart's width. |
| Towers | square: 4.4–4.9 m half width; round: 3.7–4.3 m radius; walls 1.15 m thick; 3 m above the walk | Room inside for a stair, a floor at the walk's height and a hatch; a square tower is turned square to its walls, and needs the width to fit its ground door beside a wall, in the corner the yard sees. |
| Keep | 6–7.5 m by 5–6 m (half), walls 1.5 m, 6 m above the walk; its hall 5 m high | The tallest thing in the fort, so it reads from far off. |
| Doorways | 1.5 m wide, 2.7 m high (onto the walk 2.5 m; the keep's 2.0 by 3.3 m) | Walked through in comfort at an eye of 1.7 m. |
| Stairs to the walk | 1.7 m wide, steps 0.2 m high and 0.28 m deep | A comfortable 36 degrees. |
| A tower's stair | 1.0 m wide (strips of 1.1 m), steps 0.22 m by 0.25 m | Steeper, to fit: two flights and a landing to the walk, slabs on to the top. |
| Floors | 0.3 m thick; rooms at least 2.6 m high | |
| Timber house | 3.3–4.2 by 2.4–2.9 m (half), eaves at 3 m, roof pitch 0.95 (about 44 degrees), 0.45 m overhang | A barn or a store against the wall. |
| Well | 1 m radius, 0.85 m high, its shaft drawn dark 0.2 m under the rim | After phase 3a: dark, so it reads as a hole. |
| Window | 0.7 m wide, 1.1 m high, 0.35 m deep | |

**The fort:** 4 to 6 towers at the corners of a rough polygon (square and round mixed, at least one of each), 53–64 m across on the five check seeds, its yard 1,100–2,000 m². The gate is in the side facing where the road arrives; the keep stands against the far wall; one or two timber houses and a well stand in the yard; stairs go up to the walk in at least two places. Seed 3's fort: 6 towers (3 round), 2 stairs, 2 houses, a well, 26 torches and 10 lit windows in 294 shapes; 63.6 m across, its yard 1,984 m².

**Its site:** the platform is levelled to the median ground under it, with banks of 1 in 2.4 out to the land; water within its footprint is filled. Where its road could not come in at 8% or gentler from any point of the old road nearby, the platform is moved toward the road's height by up to 2.5 m (seed 3: 2.1 m lower than its ground). The road's last stretch is replaced by a curve into the gate, graded evenly, and the ground along it brought to it on banks of 1 in 2.6. Trees and bushes are cleared from the fort and 24 m beyond its walls.

## Villages (phase 3b)

The village pieces' sizes, in `SCALE.kit`, and the rules a village is composed by, in `SCALE.village`. Half widths unless said.

| | | |
|---|---|---|
| Cottage | 2.6–3.4 by 2.1–2.6 m, eaves at 2.6 m, roof pitch 1 (45 degrees), walls 0.3 m | One room under a thatch or shingle roof, a chimney, a door 1.2 by 2.2 m. |
| Larger house (hall) | 3.6–4.5 by 2.6–3.1 m, eaves at 4.5 m with an upper storey at 2.6 m | Two rows of windows, so it reads as two floors from the road. |
| Barn | 4.8–6.2 by 3.3–4 m, eaves at 3.6 m, a doorway 3–3.3 m wide | Dark boards, at the village's edge, one or two to a village. |
| Chapel | 4.4–5.2 by 2.6–3 m, eaves at 4.2 m, pitch 1.3, walls 0.6 m; a bellcote on its gable, or a tower 1.7 m (half) and 9 m tall | Dressed stone, the tallest roof in a village, so it reads from a viewpoint. |
| Market shelter | 2.6–3.4 by 1.9–2.3 m, eaves at 2.5 m, on posts | On the green. |
| Jetty | 0.85 m wide (half), 0.55 m over the water, 8–16 m long, posts every 2.4 m | On the shore village's water, slid along the shore until clear. |
| Fence | 1.2 m high, posts every 2.4 m, rails at 0.5 and 1 m; a gate gap 3 m | Rails and posts are held at two cells while at least 0.35 of that, else not drawn. |
| Dry-stone wall | 0.95 m high, 0.64 m thick | Rough courses; the joints between stones are left out (they blink). |
| Signpost | 2.4 m high, arms 0.72 m long | Where the village's road meets the main road; the footpaths keep 2.8 m from it. |
| Haystack, bench | a haystack 3.4 by 2.4 m, 2.6 m to its ridge; a bench 1.6 m long, seat at 0.46 m | |
| Inside a house | a hearth 1.4 by 0.8 m and 0.55 m high (its glow lights the room at night), a table 0.76 m high, a bed, a shelf 1.7 m high | In the houses one can enter (two to four a village) and, after phase 3b, in the keep's hall and one tower room. |
| Footing | rubble from the lowest ground to the floor; the ground may fall at most 1.2 m across a house, and its door's ground must lie between 0.5 m under the floor and the floor | A house that cannot meet this moves, or is dropped. |
| Bridge | 4.7 m wide; timber: a deck 0.28 m thick, 1 m over the water, rails 1 m high, posts every 3 m; stone: level, its arches springing over the water, parapets 0.8 m high | Timber where a road crosses up to 8 m of water, stone (1–3 arches) where it crosses more. |

| Composition | | |
|---|---|---|
| Houses | 8 to 20 a village | Seed 3: 12, 19 and 10. |
| Setback from the lane | 2.5–6 m; at least 3.2 m between houses; turned up to 0.13 rad off the lane | Space to walk between and to see sky. |
| Lanes and paths | lanes 3 m wide, footpaths 1.4 m | |
| Green | 12–17 m radius, the well and the market shelter on it | The green pattern only. |
| Shore | houses 14 m back from the water, facing it | The shore pattern only. |
| Lit windows | 80% of houses | |
| Fields | 3 to 5 blocks a village, 22–40 by 16–28 m, on ground no steeper than 10%, strips 6–11 m wide along the contour | Crop, stubble and fallow strips. |

## People (phase 4a)

A person's sizes are in `FIG` (`src/world/people/figure.js`), before each person's own scale of 0.93 to 1.04. Speeds and numbers are in `src/world/people/people.js`.

| | | |
|---|---|---|
| Height | 1.72 m (1.60 to 1.79 m by person) | The fort's doors (2.2 m) and the houses' (2.2 m) clear the tallest with room for a helmet. |
| Shoulders, chest | 0.42 m across, 0.24 m deep | |
| Hip | 0.86 m | The legs' top; a tunic falls 0.1 m below it. |
| Head | 0.2 by 0.22 m, 0.24 m tall | |
| Legs, arms | 0.15 m and 0.11 m thick | Held at two cells near; merged into the body past 14 m. |
| Body, for meeting | radius 0.28 m | You cannot walk through anyone upright; someone in bed is a low body on it. |
| Walking | 1.15 to 1.45 m/s by person, a cycle of two steps every 1.3 m | Slower than you (4.5 m/s), so you overtake. |
| The watch on the wall walk | 0.8 m/s, to and fro along its beat | |
| Making way | closer than 0.75 m, one steps aside (up to four rounds in a crowd); a walker meeting you within 2.2 m steps round you or waits a metre short | |
| Greeting | within about 2.3 m, in front of you and facing you; the line shows for about 5 s | |
| Lights | a lantern or torch out of doors from 18.4 h to 6.1 h | |

| Who | | |
|---|---|---|
| Villagers | 10 to 20 a village (1.15 to a house) | About 60 people to a world in all (301 on the five checked seeds). |
| Guards | 9, three watches of three changing at 6 h, 14 h and 22 h; the watch asleep has a bunk each in the keep, the watches taking turns | The gate and the wall walk always have one; the relief goes up a quarter of an hour early. |
| Travellers | 3 or 4, each walking a main road over a day or two | Rest by a well by day, on a bench only after about 19.8 h. |

