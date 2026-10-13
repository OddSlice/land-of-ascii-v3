# Land of Ascii v3: the game's rules

Written 13 Oct 2026, in phase 5a. The art bible (`docs/art-bible.md`) says how the land looks; this says what you do in it and how the game answers. It is the first of its kind: until phase 5a the land had no rules of play, which is where the first build's game loop never arrived (its retrospective, section 11).

The rules come from what the research found in Swaggerfall's design (`reference/RESEARCH.md`, section 3): every action earns something, work comes from the people of a settlement, and looking at a view is both a skill and a keepsake. Here, every walk adds to the map, every greeting to the people you know, every view you stop for can be kept, and the villagers have small favours that send you across the land.

## 1. What you do

You arrive on a rise by a road in a land you do not know. The map shows nothing yet. Someone from the nearest village is already walking up the road to meet you, with a favour to ask. From there:

- **Walk, and see.** The map fills in with the land you have seen and the roads you have walked.
- **Find the places.** The journal lists every place the land has, and notes each the first time you come near it and can see it.
- **Meet people.** Greet them (E). The journal remembers everyone you have greeted.
- **Sketch views.** K keeps the view in front of you, as it is. A few views are notable, and the journal ticks them off.
- **Do favours.** Some people have a favour to ask when you greet them. Each one sends you across the land to a named person or a described place, with directions a villager would give and no marker.
- **Earn standing.** Each favour done raises how the land knows you, from a stranger to a wayfarer and on. People greet you by it. It unlocks nothing.
- **Walk at night.** The first favour you finish earns a lantern (L), which lights your way as the villagers' lanterns light theirs.

Nothing here can be lost or failed. There is no combat, hunger, health, money, inventory grid or crafting, and no door opens that did not before.

## 2. The world does not wait for you

People and animals live by the clock, as they have since phases 4a and 4b. Where someone is is a pure function of the seed, the day and the hour. Your progress is the only state the game keeps, and it never changes anyone's day:

- a favour never makes a person wait for you, change their plan or follow you;
- the person a favour is for is found where their own day puts them, and the words say where and when that usually is;
- a lost thing lies where the favour's words say, and is drawn there only while you are looking for it.

**The one exception is the first meeting.** In a first session (no progress saved for this world yet), the first favour's giver walks out from their day to the spawn's road. They reach its edge a minute after the start, wait there for about two hours, then walk back into their day. Their walk out and back is a function of the clock alone, like everyone's day. It is applied only while that first session lasts, and never in the tools.

## 3. Discovery

### The map (M)

At the start the map is plain dark paper. It fills in from three things, tracked on the coarse squares the renderer already marches over, never per cell:

- **What was in view.** Each frame a few rays cross your view, over the land's 16 m squares, out to 480 m. A square counts as seen when its highest point rises above everything nearer on the ray.
- **Where you have walked.** The squares within 24 m of your feet count as seen. The 8 m squares you walk on are remembered, and a road is drawn on the map only where you have walked it.
- **Viewpoints.** Standing within 8 m of a viewpoint shows the land within 700 m of it.

A site's mark (the fort's walls, a village, a viewpoint) appears once you have found it. The spawn and you are always marked.

### Places (the journal)

Every world lists the same kinds of place, from the generator's own records:

| Place | Found within (m) | Seen by |
|---|---|---|
| The fort | 150 | its keep, its gate or a tower |
| Each village (three) | 110 | its middle |
| Each viewpoint (four) | 30 | its top |
| The great lake | 90 | any of up to 40 points over its water |
| The coast | 90 | any of up to 60 points along the sea's edge |
| Each bridge | 50 | its deck |
| The head of each river | 50 | where it rises |
| The foot of the mountains | 70 | where the low land ends nearest the middle of the land |

A place is **found** the first time you are within its distance and a straight line from your eye to one of its points clears the land (the ground, or water's surface). Trees do not hide a place. The journal shows found against total for each group and in all, and says how much of the land you have seen.

Villages, hills, rivers and the lake take names from the seed (`src/game/words.js`). A village's name is learned as you find it.

### People (the journal)

Everyone you have greeted is listed, with their name, their role and their village (or the fort), and when you last saw them. You last saw someone when you greeted them, or when you were within 12 m of them.

Two people can share a name. The journal and the words of a favour always give the role and the village, which tell them apart.

## 4. Sketches

**K keeps the view in front of you:** the frame on screen, cell for cell, as a glyph picture at your detail level. It never includes the statistics, the menu, the journal or any words. It is kept with:

- the place: the notable view's name, or near the nearest place you have found, or the open country;
- the hour and the weather.

**Notable views** are each viewpoint (sketched from within 30 m of its top) and the fort's wall walk (sketched standing on the walk, within 2.5 m of a guard's beat). The journal names them and ticks each one once sketched.

**The sketches page** shows every sketch as a small picture. Any of them opens full screen, drawn as the game draws it, and pages through with the arrow keys. **Copy as text** writes the sketch as plain monospace text, a line for each row and a character for each cell, to paste anywhere. A world keeps up to 60 sketches.

## 5. Favours

### Who asks, and for whom

A world draws its favours once, from its seed and its people. About ten to sixteen people have one each. Both the people who ask and the people favours are for have a landmark they keep to:

| Role | Usually found | When |
|---|---|---|
| Minds the green | on the green | early morning until evening, but for the midday meal |
| Keeps the well | by the well | the same |
| Keeps the chapel | at the chapel door | in the morning, and through the afternoon |
| Fisher | out on the jetty | early morning until evening, unless there is mist |
| Farmer | in the fields on one side of the village | early morning until evening, but for the midday meal |
| Shepherd | with the flock on its pasture | soon after dawn until dusk |
| Guard at the gate | at the gate of the fort | by watch: 6 to 14, 14 to 22, or 22 to 6 |

The first favour's giver is the exception: someone free in the afternoon from the village nearest the spawn by road. They are not a shepherd, whose flock follows them, or the person a dog follows.

Every person a favour is for, and every giver one comes back to, can be met for at least two hours on every day (the world check looks at 28 days).

### The three kinds

- **Carry:** take a thing to a named person who lives in another village or at the fort. It is done when you greet them.
- **Find:** a thing was lost at a described place, such as a field's wall, a sheepfold, a signpost, a bridge, the edge of a copse, the top of a hill or the lake's shore. Reaching it (within 1.8 m) picks it up. It is done when you bring it back and greet the giver.
- **Tell:** say something to a named person in another village or at the fort, and bring back their answer. Greeting them gives you the answer. It is done when you bring it back and greet the giver.

There are 12 of each kind in the words, so a world draws a varied set. A world's favours are spread over its towns, and each kind turns up in turn.

### How far

A favour's walk, there for a carry and there and back for the others, is chosen to take four to twelve minutes at walking pace (4.5 m/s). It is measured along the ways a player walks.

### The words, and finding the way

When you greet someone with a favour, they ask it in two or three lines. You answer **I will do it** (E, or the button) or **another time** (Escape, the button, or walking away). Asked again, they ask again.

The journal's favours page keeps what to do in the words a villager would use. They name:

- the person, with their role and village;
- the village, and its direction from the giver's village ("Corwen lies west of Ashby, by the road"). Where two villages lie the same way, the words say which ("the farther of the two villages that way").
- the landmark there ("by the well in Corwen", "in the fields on the north side of Corwen"), and when the person is usually there;
- for a lost thing, the place ("by the wall of the pasture on the north-east side of Dunholme");
- where to bring it back.

They **never give coordinates or a marker**: finding it is the game. Every place the words describe is chosen to be plain:

- a field or fold alone on its side of its village;
- the nearest copse or hill that way from its village;
- the nearest bridge that way from home.

The world check gives each favour's words alone to a scripted player and makes it walk them (section 8).

### Chains

Some favours chain: when you reach the person at the far end of a carry or a tell (handing over the thing, or giving the word and taking their answer), they may have a favour of their own, asked there and then ("While you are here, there is something you could do for me too"). The first favour starts a chain of up to three.

### Carrying

What you carry is listed in the journal's rail and on its favours page: a thing to deliver, a thing found, word to give or an answer to bring. The thing you took most recently is in your left hand as you walk. Words are not drawn.

## 6. Standing, and the lantern

Standing is the number of favours done:

| Favours done | Known as |
|---|---|
| 0 | a stranger |
| 1 | a wayfarer |
| 3 | a friend of the road |
| 5 | a known face |
| 8 | a trusted hand |
| 12 | a friend of the whole land |

**Greetings change with it.** Every other usual greeting begins with a hail for your standing ("Good day, wayfarer."). Standing unlocks nothing.

**The lantern** is given by the person you finish your first favour for. L lights it or puts it away.

- **Lit,** it is in your right hand, and its light is the people's lanterns' own:
  - a moving point light at its flame;
  - the same strength and flicker;
  - lighting only the ground and walls near it;
  - never starting the shadow sweep;
  - mirrored in water.
- **Indoors** it lights only the room you are in.

Shift L is the look panel in the world. Elsewhere L still is.

## 7. What is kept

Progress is kept for each world (each seed) in the browser's local storage:

- the places found, and when;
- the land seen and the squares walked;
- the people met, and when last seen;
- the sketches and the notable views ticked;
- each favour's state (asked, taken, half done, done);
- your standing (the favours done);
- the lantern, and whether it is lit;
- whether the first favour has been asked.

**When it is written:** every change within four seconds, and a favour, a sketch or the lantern at once. Leaving the page writes what is left. The record is a few hundred characters to a few kilobytes: the seen and walked squares as runs of bits. Each sketch is its own entry (its cells deflated), written once.

**When it is read:** on load. A plain visit to the default seed resumes it. A new world from a new seed starts fresh, and the first world's record is kept.

**The World section of the menu** shows:

- a save line: what is kept for this world;
- **copy a backup as text:** everything, sketches included, as plain lines to keep anywhere;
- a box to **paste a backup and restore it.** A backup of another world is kept for that world, with a button to open it.
- **clear progress,** which asks first and clears only this world.

**If the browser keeps nothing** (a private window, blocked or full storage), the game runs as before and the journal works for the session. The save line says so, once.

**The tools** run with progress off: nothing is read, kept, tracked or drawn, and no picture or measurement changes because of it. A tool that tests progress turns it on itself (`lab.progress.enable()`).

## 8. How it is checked

`tools/world-check.mjs` (check 14, and `--way-only`) checks, on five seeds and a sweep of 60:

- every favour's giver, the person it is for and the lost thing exist, and can be reached on foot from the giver under the player's rules;
- everyone a favour is for, and every giver one returns to, can be met for two hours on each of 28 days;
- no lost thing lies inside a shape, in water or on a road or path;
- every listed place can be found by walking to it;
- the first giver reaches the spawn's road within two game minutes of the start, by a way that can be walked, and stands at its edge clear of the spawn;
- a scripted player who knows only the words does one favour of each kind, and then every other favour, each in four to twelve minutes of walking.

`tools/progress-check.mjs` plays a session, loads the page again, restores a backup in a fresh profile, runs without storage, and clears.
