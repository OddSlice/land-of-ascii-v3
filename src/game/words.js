// Wayfaring's words (phase 5a): every favour, the names of places, how a
// place or a person is described, the standing titles and how people hail
// you by them, in the same quiet voice as the greetings
// (src/world/people/lines.js). Data only: src/game/favours.js and
// src/game/places.js fill the slots in braces.
//
// The voice: plain words, warm and unhurried; never an exclamation mark,
// never modern phrasing, never quests, points or levels.
//
// Slots: {giver} {dest} the people's names; {destIs} what the other does and where
// ("keeps the well in Ashby"); {town} a village's name or "the fort"; {home} the
// giver's village; {dir} a compass word ("north-east"); {where} {when}
// where and when someone is usually found; {thing} {short} the thing;
// {lost} where it was lost; {msg} {answer} a message and its answer.

// ---- names ---------------------------------------------------------------------

export const VILLAGE_NAMES = [
  'Ashby', 'Bramhope', 'Corwen', 'Dunholme', 'Elmswick', 'Fennick', 'Garthby', 'Hartsop', 'Kettlewick', 'Lowmere',
  'Marnhull', 'Netherby', 'Oakhurst', 'Pennock', 'Ravensey', 'Sedgecombe', 'Thornby', 'Wendlow', 'Yarrowby', 'Coldwell',
];
export const HILL_NAMES = [
  'Raven Brow', 'Thorn Knowe', 'the Grey Height', 'Windy Brow', 'Hob\'s Seat', 'the Watch Stone', 'Curlew Top', 'the Old Cairn',
  'Harrow Edge', 'Lark Rise', 'Crag End', 'the Shepherd\'s Seat',
];
export const RIVER_NAMES = ['the Wend', 'the Coldbeck', 'the Brede', 'the Ashburn', 'the Lissen', 'the Mirrow', 'the Skell', 'the Fennwater'];
export const LAKE_NAMES = ['Long Mere', 'Still Mere', 'Grey Mere', 'Heron Mere', 'Reed Mere', 'Elder Mere'];

// The eight directions, from north round by east.
export const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// ---- the places the journal lists ------------------------------------------------
// `title`: the name on the page; `where`: a line on where it lies, once it
// is found; `hint`: what the page says of a place not yet found.

export const PLACE_WORDS = {
  fort: { title: 'the fort', where: 'on its rise {dir} of {near}, over the land round the lake', hint: 'a fort on a rise, they say, somewhere near the great lake' },
  village: { title: '{name}', where: '{dir} of {near}, on the road', hint: 'a village' },
  viewpoint: { title: '{name}', where: 'high ground {dir} of {near}', hint: 'high ground with a long view' },
  lake: { title: '{name}', where: 'the great lake, {dir} of {near}', hint: 'the great lake in the middle of the land' },
  coast: { title: 'the coast', where: 'where the land meets the sea, {dir} of {near}', hint: 'the sea, somewhere past the low land' },
  bridge: { title: 'the bridge over {river}', where: 'on the road to {town}', hint: 'a bridge where a road crosses a river' },
  source: { title: 'the head of {river}', where: 'up in the hills {dir} of {near}, where it rises', hint: 'where a river rises, up in the hills' },
  foot: { title: 'the foot of the mountains', where: 'where the low land ends, {dir} of {near}', hint: 'where the land begins to climb to the mountains' },
};
// How close you must come to a place, with a clear sight of it, for it to
// count as found (metres, across the land).
export const FOUND_AT = { fort: 150, village: 110, viewpoint: 30, lake: 90, coast: 90, bridge: 50, source: 50, foot: 70 };

// ---- people: where and when each is usually found -----------------------------------

export const USUAL = {
  minder: { where: 'on the green in {town}', when: 'from early morning until evening, but for the midday meal' },
  wellkeeper: { where: 'by the well in {town}', when: 'from early morning until evening, but for the midday meal' },
  keeper: { where: 'at the chapel door in {town}', when: 'in the morning, and again through the afternoon' },
  fisher: { where: 'out on the jetty at {town}', when: 'from early morning until evening, unless there is mist on the water' },
  farmer: { where: 'in the fields on the {side} side of {town}', when: 'from early morning until evening, but for the midday meal' },
  shepherd: { where: 'with the flock on the pasture {side} of {town}', when: 'from soon after dawn until dusk' },
  guard0: { where: 'at the gate of the fort', when: 'from six in the morning until two in the afternoon' },
  guard1: { where: 'at the gate of the fort', when: 'from two in the afternoon until ten at night' },
  guard2: { where: 'at the gate of the fort', when: 'through the night, from ten until six in the morning' },
  householder: { where: 'about the houses of {town}', when: 'at most hours of the day' },
};

// ---- the favours --------------------------------------------------------------------
// carry: take a thing to someone in another village or at the fort.
// Each: the thing (`thing`, and `short` once you have it), its `shape` in the
// hand and on the ground (src/world/things.js), what the giver says asking
// (`ask`, two lines), and what the one you bring it to says (`got`).

export const CARRY = [
  { id: 'nets', thing: 'a bundle of mended nets', short: 'the mended nets', shape: 'bundle',
    ask: ['The nets are mended at last, and {dest} has waited long enough for them.', '{dest} {destIs}, {dir} of here. Would you carry them there for me?'],
    got: ['Nets from {giver}. Good, these will see the summer out.', 'Tell {giver} the boat will be out again by morning.'] },
  { id: 'eggs', thing: 'a basket of eggs, packed in straw', short: 'the basket of eggs', shape: 'basket',
    ask: ['The hens have laid more than we can eat, and {dest} has none to spare this year.', '{dest} {destIs}, {dir} of here. Would you take the basket? Walk gently with it.'],
    got: ['Eggs, and not one cracked. You walk a careful road.', '{giver} is good to remember us.'] },
  { id: 'honey', thing: 'a jar of honey from the hives', short: 'the jar of honey', shape: 'jar',
    ask: ['The bees did well by us. I promised a jar of it to {dest}.', '{dest} {destIs}, {dir} of here. Would you take it, if your way goes there?'],
    got: ['Honey. I have thought of nothing else since {giver} spoke of it.', 'Thank you for bringing it all that way.'] },
  { id: 'rope', thing: 'a coil of new rope', short: 'the coil of rope', shape: 'rope',
    ask: ['This rope is for {dest}. The old one frayed through last week.', '{dest} {destIs}, {dir} of here. It is not heavy, only awkward. Would you carry it?'],
    got: ['New rope, and well laid. {giver} has good hands.', 'That will hold for years.'] },
  { id: 'seed', thing: 'a sack of seed barley', short: 'the sack of seed barley', shape: 'sack',
    ask: ['We kept back more seed than we need. {dest} lost theirs to the damp.', '{dest} {destIs}, {dir} of here. Would you take the sack to them?'],
    got: ['Seed barley. That saves the field this year.', 'Tell {giver} we will repay it at harvest.'] },
  { id: 'letter', thing: 'a letter, folded and sealed', short: 'the sealed letter', shape: 'letter',
    ask: ['I have written to {dest}, and the carter will not pass that way for a week.', '{dest} {destIs}, {dir} of here. Would you carry the letter?'],
    got: ['A letter from {giver}. I know the hand.', 'I will read it by the fire tonight. Thank you.'] },
  { id: 'boots', thing: 'a pair of boots, newly soled', short: 'the boots', shape: 'bundle',
    ask: ['{dest} left these boots with me to be soled, and they are done.', '{dest} {destIs}, {dir} of here. Would you take them back?'],
    got: ['My boots. I have been walking in my old ones and feeling every stone.', 'Thank {giver} for me.'] },
  { id: 'salve', thing: 'a pot of salve for sore hands', short: 'the pot of salve', shape: 'jar',
    ask: ['I made this salve for {dest}, whose hands crack in the cold.', '{dest} {destIs}, {dir} of here. Would you take the pot along?'],
    got: ['Salve, from {giver}. My hands thank you already.', 'You are kind to carry it.'] },
  { id: 'knife', thing: 'a knife, freshly ground', short: 'the knife', shape: 'knife',
    ask: ['I ground this knife for {dest}. It will cut true again now.', '{dest} {destIs}, {dir} of here. Would you carry it to them? Mind the edge.'],
    got: ['My knife, and sharper than it ever was.', 'Tell {giver} I owe a good turn.'] },
  { id: 'bread', thing: 'a loaf and a round of cheese, wrapped in cloth', short: 'the bread and cheese', shape: 'bundle',
    ask: ['{dest} has been poorly, and I have baked more than enough.', '{dest} {destIs}, {dir} of here. Would you take this to them while it is fresh?'],
    got: ['Bread and cheese, and still warm in the middle. {giver} remembered.', 'Thank you. Sit a moment if you like.'] },
  { id: 'oil', thing: 'a flask of lamp oil and a new wick', short: 'the lamp oil', shape: 'jar',
    ask: ['{dest} has been sitting in the dark these last nights. I have oil to spare.', '{dest} {destIs}, {dir} of here. Would you carry the flask?'],
    got: ['Oil for the lamp. The evenings will be easier now.', 'You have done me a kindness.'] },
  { id: 'cloak', thing: 'a cloak, mended at the hem', short: 'the mended cloak', shape: 'cloak',
    ask: ['I have mended this cloak for {dest}. It tore on a gate.', '{dest} {destIs}, {dir} of here. Would you see it back to them?'],
    got: ['My cloak, and you can hardly see the mend.', '{giver} has a fine needle.'] },
];

// find: something lost at a described place, brought back to the giver.
// `doing`: what the giver was doing there; `at`: the kinds of place it can
// have been lost (see LOST); `found`: what the giver says when you bring it.

export const FIND = [
  { id: 'shears', thing: 'a pair of shears', short: 'the shears', shape: 'tool', doing: 'trimming the edges',
    at: ['fieldwall', 'fold'], found: ['My shears. Where were they?', 'I would have looked a week and not found them. Thank you.'] },
  { id: 'lantern', thing: 'a lantern, cold and dark', short: 'the lantern', shape: 'oldlantern', doing: 'coming home late',
    at: ['bridge', 'signpost'], found: ['My lantern. I set it down to rest my arm and walked on without it.', 'Thank you. I will mind it better.'] },
  { id: 'whetstone', thing: 'a whetstone in a leather pouch', short: 'the whetstone', shape: 'pouch', doing: 'sharpening the scythe',
    at: ['fieldwall', 'fold'], found: ['My whetstone. A blade is no use without it.', 'You have sharp eyes.'] },
  { id: 'hoe', thing: 'a hoe with an ash handle', short: 'the hoe', shape: 'hoe', doing: 'weeding along the edge',
    at: ['fieldwall'], found: ['My hoe. I was sure someone had walked off with it.', 'Thank you. I will not leave it lying again.'] },
  { id: 'bucket', thing: 'a wooden bucket', short: 'the bucket', shape: 'bucket', doing: 'fetching water',
    at: ['shore', 'jetty'], found: ['The bucket. I came back for it and could not think where I had put it down.', 'Thank you kindly.'] },
  { id: 'kindling', thing: 'a basket of kindling', short: 'the basket of kindling', shape: 'basket', doing: 'gathering sticks',
    at: ['copse'], found: ['My kindling. The fire will thank you tonight.', 'You found the very spot. Thank you.'] },
  { id: 'knitting', thing: 'a bag of knitting', short: 'the bag of knitting', shape: 'pouch', doing: 'sitting a while',
    at: ['bench', 'chapel'], found: ['My knitting. Three rows from the end of the sleeve, too.', 'Thank you. Sit, if you like.'] },
  { id: 'line', thing: 'a coil of fishing line', short: 'the fishing line', shape: 'rope', doing: 'trying the water',
    at: ['jetty', 'shore'], found: ['My line. A fisher without line is only a person standing by the water.', 'Thank you.'] },
  { id: 'cap', thing: 'a wool cap', short: 'the wool cap', shape: 'bundle', doing: 'looking at the view',
    at: ['viewpoint'], found: ['My cap. The wind took it off my head and I was too tired to chase it.', 'You climbed all that way. Thank you.'] },
  { id: 'sickle', thing: 'a sickle', short: 'the sickle', shape: 'tool', doing: 'cutting rushes',
    at: ['fieldwall', 'shore'], found: ['My sickle. I can get on with the rushes now.', 'Thank you. Mind the edge on it.'] },
  { id: 'salt', thing: 'a small sack of salt', short: 'the sack of salt', shape: 'sack', doing: 'coming back from the fort',
    at: ['bridge', 'signpost'], found: ['The salt. I thought I had lost the whole week\'s worth.', 'Thank you. It would have been a bland supper.'] },
  { id: 'staff', thing: 'a walking staff of blackthorn', short: 'the blackthorn staff', shape: 'staff', doing: 'walking up for the air',
    at: ['viewpoint', 'copse'], found: ['My staff. I came down without it and my knees have told me so since.', 'Thank you.'] },
];

// tell: go and tell someone something, and bring back their answer.
// `msg`: what to say (a clause after "that"); `answer`: what they say back.

export const TELL = [
  { id: 'mill', msg: 'the mill wheel is mended', answer: 'Then I will bring the grain down on the next fair day.',
    ask: ['Would you take word to {dest}, who {destIs}, {dir} of here?', 'Say that {msg}, and bring me back whatever answer comes.'] },
  { id: 'calf', msg: 'the brown cow has calved, and both are well', answer: 'Good news. Tell them I will come and see the calf before the week is out.',
    ask: ['There is news {dest} will want to hear. {dest} {destIs}, {dir} of here.', 'Would you tell them that {msg}? And bring back what they say.'] },
  { id: 'wedding', msg: 'the wedding is fixed for the first fair day after harvest', answer: 'Tell them I will be there, and I will bring the fiddle.',
    ask: ['Would you carry word to {dest}? {dest} {destIs}, {dir} of here.', 'Tell them that {msg}, and bring back their answer.'] },
  { id: 'roof', msg: 'the roof wants new thatch before the rains', answer: 'I can come in four days, if the weather holds. Tell them to have the straw ready.',
    ask: ['{dest} {destIs}, {dir} of here, and knows thatch better than anyone.', 'Would you tell them that {msg}, and bring back what they say?'] },
  { id: 'debt', msg: 'the debt is paid, and gladly', answer: 'Then there is nothing between us but good will. Tell them that.',
    ask: ['I owe {dest} a word, and I would rather it went today.', '{dest} {destIs}, {dir} of here. Tell them that {msg}, and bring back their answer.'] },
  { id: 'well', msg: 'the well water has gone sweet again', answer: 'That is good to hear. Tell them we will stop boiling ours too, then.',
    ask: ['{dest} worried over the water when last we spoke.', '{dest} {destIs}, {dir} of here. Would you tell them that {msg}, and bring back what they say?'] },
  { id: 'apples', msg: 'the apples are ripe, and there are more than we can pick', answer: 'Tell them I will come with two baskets on the next dry morning.',
    ask: ['Would you take a message for me? {dest} {destIs}, {dir} of here.', 'Tell them that {msg}. And bring back their answer.'] },
  { id: 'sick', msg: 'the fever has broken and the child is sitting up', answer: 'Thank heaven. Tell them I will light a candle tonight all the same.',
    ask: ['{dest} has asked after us every day this week.', '{dest} {destIs}, {dir} of here. Would you tell them that {msg}, and bring back what they say?'] },
  { id: 'cart', msg: 'the cart will not come until the road dries', answer: 'Then we will wait. Tell them there is no hurry on our side.',
    ask: ['Someone ought to tell {dest}, who {destIs}, {dir} of here.', 'Would you say that {msg}, and bring back their answer?'] },
  { id: 'dog', msg: 'the old dog came home on its own after all', answer: 'I am glad of it. Tell them I looked for it along the river.',
    ask: ['{dest} helped us look for the dog. They should know.', '{dest} {destIs}, {dir} of here. Tell them that {msg}, and bring back what they say.'] },
  { id: 'bell', msg: 'the chapel bell has a crack and wants looking at', answer: 'I will come with my tools after the next market. Tell them to keep the bell still until then.',
    ask: ['{dest} {destIs}, {dir} of here, and knows about such things.', 'Would you tell them that {msg}, and bring back their answer?'] },
  { id: 'wool', msg: 'the wool is washed and ready for carding', answer: 'Good. Tell them I will send the carder over with the cart.',
    ask: ['Would you take word to {dest}? {dest} {destIs}, {dir} of here.', 'Tell them that {msg}, and bring back what they say.'] },
];

// What the giver says when you have taken a favour and come back without it
// done, by kind; and what they say when you bring it home.
export const WAITING = {
  carry: ['Did you find {dest}? {where}, {when}.', 'No hurry. {dest} will be glad of it when you get there.'],
  find: ['No sign of it yet? I was {doing} {lost}.', 'Have a look {lost}, if you pass that way.'],
  tell: ['Did you see {dest}? {where}, {when}.', 'I am still waiting on that answer, when you have it.'],
};
export const BACK = {
  find: ['You found it.', 'Thank you. That is a weight off.'],
  tell: ['What did {dest} say?', '"{answer}" Well. Thank you for bringing it.'],
};
// What someone with a favour of their own adds, once you have done what you
// came for (a chain): the first line before their ask.
export const AND_ME = ['While you are here, there is something you could do for me too.', 'Since you are going about, perhaps you could help me as well.', 'You have been a help to them. Could you help me as well?'];
// Saying no for now.
export const LATER = ['Another time, then. I will be about.', 'No matter. Come back if your road turns this way.', 'Some other day, then.'];
// Saying yes.
export const YES = ['Thank you. Go safely.', 'Thank you. I will not forget it.', 'Thank you. Mind how you go.'];
// The buttons under an exchange.
export const CHOICE = { yes: 'I will do it', no: 'Another time' };

// ---- the first meeting --------------------------------------------------------------
// The first time you play, someone from the nearest village comes out to the
// road where you stand with the first favour.

export const START_LINE = 'Someone is waiting for you on the road.';
// (phase 6) the title screen's line on a first visit: true from the start (they are on their way)
export const START_FROM = 'Someone from {town} is walking up the road to meet you.';
export const FIRST = {
  waiting: 'waiting on the road',
  // (where the first one to ask waits, when it is word to take and bring back)
  where: 'waiting on the road where you met', when: 'until the middle of the afternoon',
  hello: ['There you are. I saw you on the rise and thought you might be walking our way.'],
};
// The first favour done: the lantern, from the one you brought it to.
export const LANTERN_GIFT = ['Take this lantern for the road. The nights are long out here, and the lanes are dark.'];

// ---- standing -----------------------------------------------------------------------
// A title that grows with the favours done; it changes how people greet you
// and unlocks nothing.

export const STANDING = [
  { at: 0, title: 'a stranger' },
  { at: 1, title: 'a wayfarer' },
  { at: 3, title: 'a friend of the road' },
  { at: 5, title: 'a known face' },
  { at: 8, title: 'a trusted hand' },
  { at: 12, title: 'a friend of the whole land' },
];
// What people say first, now and then, by your standing (none for a stranger).
export const HAILS = [
  [],
  ['Good day, wayfarer.', 'Ah, the wayfarer.', 'Walking far today?'],
  ['They speak well of you on the road.', 'Welcome back, friend.', 'Good to see you on our side of the land.'],
  ['I know your face. You have helped folk here.', 'Good to see you again.', 'Ah, it is you. Come and stand a while.'],
  ['There is the one everyone asks for.', 'You are welcome here at any hour.', 'Good day to you, friend. We are glad of you.'],
  ['The whole land knows your step by now.', 'Welcome, friend. You are one of us.', 'Ah, there you are. Sit, sit.'],
];

// ---- small lines --------------------------------------------------------------------

export const PICK_UP = 'You find {short} {lost}.';
export const SKETCHED = 'You sketch the view{at}, at {time}, {weather}.';
export const SKETCHED_NOTABLE = 'You sketch the view {notable}, at {time}, {weather}.';
export const NOTABLE_WALL = 'from the wall walk of the fort';
export const NOTABLE_HILL = 'from {name}';
// How close you must stand to a notable view to sketch it (metres).
export const NOTABLE_AT = { viewpoint: 30, wall: 2.5 };
export const PARTS_OF_DAY = [[5, 'before dawn'], [8, 'early morning'], [11.5, 'morning'], [13.5, 'midday'], [18, 'afternoon'], [21, 'evening'], [24, 'night']];

// What each role does, as said of someone elsewhere: "{dest} {destIs}".
export const ROLE_IS = {
  minder: 'minds the green in {town}', wellkeeper: 'keeps the well in {town}', keeper: 'keeps the chapel in {town}',
  fisher: 'fishes from the jetty at {town}', farmer: 'farms a strip of the fields at {town}', shepherd: 'keeps the sheep at {town}',
  householder: 'keeps house in {town}', carter: 'drives the cart from {town}', guard: 'keeps watch at the fort',
};
