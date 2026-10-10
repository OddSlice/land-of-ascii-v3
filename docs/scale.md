# Scale

The numbers the generated world is built to, and the reasons for them. They live in code in `src/world/scale.js`; change a number there and here together. Distances are metres, speeds metres a second, and slopes rise over run (so 12% is 0.12, and 45 degrees is 1.0).

Measured figures come from the default world (seed 3), built by `src/world/gen/world.js`.

## The map

| | | |
|---|---|---|
| Size | 2048 × 2048 cells, one metre each, no wrapping | Large enough for many minutes of walking with the edges out of sight, and small enough to build in under 4 s and keep under 300 MB. |
| Sea level | 20 m above the datum | The datum sits under the deepest sea bed, so no height is negative. |
| View distance | 1,500 m | Across the lowland to the range. Beyond it, the sea plane is drawn to the horizon, so the coast never ends at an edge. |
| Mountains | close the north and east; about 300 m above the sea at the top, snow from 235 m | A backdrop you walk toward, not terrain you walk through. The range front lies about 430 m in from those edges. |
| Sea | closes the south and west; the shore lies about 240 m in | Beaches on low, gentle ground within about 34 m of the sea; low cliffs along some stretches. |

Seed 3 is 23% sea, 3% lakes, 1% rivers and 73% land (41% lowland, 32% range). Its highest point is 244 m above the sea (seeds 1, 2, 4 and 5 reach 302, 287, 314 and 284 m); 2% of it is snow and 6% bare rock.

## The body

| | | |
|---|---|---|
| Eye height | 1.7 m above the feet | An adult's eye. Trees, wall and road read at true size against it. |
| Walking speed | 4.5 m/s, measured along the ground | Brisk game walking: real walking is about 1.4 m/s, which is too slow for a world this size. Measured along the slope, so hills neither speed you up nor slow you down on the map. |
| Running speed | 8 m/s (Shift) | |
| Wading | slows smoothly to 45% of walking speed at chest depth | |
| Swimming | 1.2 m/s, past chest depth (1.3 m of water), with the eye 0.15 m above the surface | |
| Flying | 50 m/s (F) | For looking round the world. Space climbs. |
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
| Trees | about 12,000 conifers, in stands on a jittered 5 m lattice | Seed 3 has 11,777 trees and 596 bushes. |
| Tree height | 11 to 24 m for most trees; a few emergent trees reach about 36 m | Seed 3 median 19.4 m. Mature spruce and fir height, so a stand edge stands well above the eye across a meadow. |
| Roads | dirt, 4 m wide, flattened across their width; steepest 12% | A cart track. The path search refuses 4 m steps steeper than 7.5% and loosens only where it must (9, 11, 14, then 20%). The laid road is graded to 9.6% and never cut or banked more than 1.5 m. `world-check.mjs` measures each road along its length over 4 m. |
| The wall | 120 m long, 3 m thick, 6 m high, with merlons 1.5 m high and a gate 4 m wide | The 0A wall, at the fort site. The gate faces the roads. |

## Sites

- **Spawn:** on a road, on a low rise (9 m above the ground around it on seed 3), facing the main lake, with forest to one side and the range behind.
- **Fort:** on a rise near the main lake (on seed 3, 172 m from it and 12 m above its surroundings).
- **Villages:** three, on flat ground near water.
- **Viewpoints:** four, on high ground with long views (on seed 3, 188 to 228 m above the sea).
