# Changelog

Land of Ascii v3, newest first. The version is in `package.json` and shows in the menu and on the title screen. The middle number is the phase, and the last number counts releases within it. Before 0.5.1 the phases carried no version. Each phase's full record is in `docs/`.

## 0.6.1 (15 Oct 2026): a QA and engineering pass

There is nothing new to see or play.
- **Audit:** the game's own tools, plus a new audit (`tools/audit.mjs`) of what they don't cover. See `docs/qa-0.6.md`.
- **Removed:** the look comparison switches (the look panel, keys 5 6 8 9 0, the menu's comparisons, the URL options) and the reference view (R in the Look Lab). Every cell is unchanged.
- **Fixed:**
  - at the largest text size on a short window, the title screen's version line no longer sits on its panel;
  - the building yard's three cameras in the air are held there, instead of falling (a tools' scene only).
- **Code:**
  - every file is now under 600 lines;
  - dead code is gone;
  - the tools share one way of opening a page and freezing the clock (`tools/lib/game.mjs`, `lab.view`).
- **Docs:**
  - a new architecture document (`docs/architecture.md`);
  - a QA report (`docs/qa-0.6.md`);
  - a fact sheet (`docs/facts.md`);
  - the README, the art bible, scale and design brought up to date.

## 0.6.0 (14 Oct): a game to send to people

- **Front page:** at the site's root, with the game moved to `play.html`. Old links with options still lead to the game.
- **Title screen:** over a drifting flyover of the world, with Play or Continue, New world, Settings and Share this world.
- **First visit:** the detail level is measured once, and the keys that matter are shown on the first walk.
- **Sharing:** a link to the world, or to a place and an hour in it. Sketches can be saved as images.
- **Comfort:**
  - keys can be changed;
  - three text sizes;
  - reduced motion;
  - a 30 or 60 frames-a-second cap;
  - full screen on F11;
  - a pause when the window is left;
  - a plain message where the browser cannot run the game.
- **Music:** chords voiced without semitone rubs after a measured listening pass. See `docs/phase6.md`.

## 0.5.5 (14 Oct): people, the map and signposts

- **People:** they read front from back (a face, hair behind, boots forward). E greets from any side within 3 m, with a prompt naming who.
- **The map:** a drawn layer with the places' names, the compass, a legend, a scale and an arrow for where you face.
- **Signposts:** they say where each road goes and how far.

## 0.5.4 (14 Oct)

- **Music:** three fixed tracks, each running into the next and round again.
- **Sound:** starts at 90%.

## 0.5.3 (14 Oct)

- **Music:** slow, quiet music made in code.
- **Footsteps:** sound every other step.

## 0.5.2 (14 Oct): phase 5b, sound and polish

- **The land's sound, made in code:** wind, rain, water, birds and beasts, footsteps, fires, wells, the chapel's bell and doors. N turns it off, and the menu has a Sound section.
- **Polish:** a round of fixes from earlier phases.

## 0.5.1 (14 Oct): phase 5a, wayfaring

- **Discovery:** the map fills in as you go.
- **The journal (J):** places, people and sketches (K).
- **Favours** from the villagers: carry, find and tell, with standing and a lantern (L).
- **Progress:** kept for each world, with a backup as text.
- **Version:** shown in the menu.

## Phase 4b (13 Oct): animals and wild ground detail

- **Animals:** flocks with folds and shepherds, cattle, hens, dogs, deer, hares, ducks, gulls, crows and small and large birds, all by the clock.
- **Wild ground detail:** boulders, outcrops, logs, stumps, reed beds and drifts of flowers.

## Phase 4a (13 Oct): people

- **Villagers, the fort's watch and travellers**, each living a day that is a pure function of the seed, the day and the hour.
- **Greetings** in a quiet voice.

## Phase 3b (13 Oct): villages and bridges

- **Villages:** three a world, each composed from the land: one strung along its road, one round a green, one on a shore with a jetty. Houses can be entered.
- **Around them:** fields, fences, dry-stone walls and footpaths.
- **Bridges:** timber and stone.
- **The fort's road** now winds up to the gate.

## After phase 3a (12 Oct)

- **Fort stone:** its own paler colour, and joints that show from further off.
- **Moving:** Space jumps, and you can step off the wall walk; stairs no longer stutter.
- **Other fixes:**
  - the well is a dark hole;
  - the clock runs in real time;
  - only the tidy conifers remain;
  - Chromium is asked for the mouse's raw movement.

## Phase 3a (12 Oct): the building kit and the fort

- **The kit:** building pieces as exact shapes, drawn, shadowed and walked on alike.
- **The fort:** one on every seed, with walls, towers, a keep, stairs and torches.
- **The building yard:** `?yard=1`.

## Phase 2b (11 Oct): weather and the menu

- **Weather from a forecast** that is a pure function of the seed, the day and the hour: clear, fair, overcast, rain and mist.
- **The menu** on Escape.
- **Look fixes:** five of them.
- **Afterwards:**
  - big screens drawn at the cost of a 1440 × 900 window;
  - the statistics on by default;
  - the menu laid out as tabs.

## Phase 2a (11 Oct): air and far land

- **Air:** aerial perspective.
- **Mountains:** far ones with lit faces, gullies and snow, and a backdrop range past the north and east edges.
- **The moon** has phases, and dawn has its own keyframe.
- **The coast** has a wet band, foam and a swell.
- **Also:** copses, and viewpoints at the brows of hills.

## Phase 1 (10 to 11 Oct): the world

- **The world:** a 2,048 m land generated from a seed, with lowland, lakes, rivers, forests, roads, mountains to the north and east and the sea to the south and west.
- **Workers:** the world is built in its own worker, and on Vercel the workers share one copy of it.
- **The look** was locked.

## Phases 0a to 0c (10 Oct): the Look Lab

- **0a:** one small, fixed valley, built to prove the look: a CPU column march, a resolve step and a WebGL2 presenter.
- **0b:** water that reflects and refracts, and a 2 km stress scene. The CPU backend stays, with density 3 as the default.
- **0c:** a look pass with candidates chosen by eye, and the art bible's first draft.
