LAND OF ASCII: the promo package
================================

Everything here points to ODDSLICE.ITCH.IO. Every picture of the land is
the game's own frame, recorded from the real game (seed 3), never painted
or redrawn. The words are in the game's own font, Cascadia Mono, and the
frames round the images are the game's own stone and timber.


video/
  land-of-ascii-trailer.mp4
    The 30-second trailer: 1920 x 1080, 60 frames a second, H.264, with
    the game's own music and sounds. For YouTube, Vimeo, X, Bluesky,
    Mastodon, a devlog. The story: the title screen and a click on Play;
    walking up the road as Rose Cobb comes to meet you, her greeting and
    her favour taken; a sketch of a pasture and the journal open on it;
    four views from dawn to night (Still Mere, Dunholme, the bridge over
    the Skell, the fort); the end card, PLAY LAND OF ASCII NOW and
    ODDSLICE.ITCH.IO.

images/   (1920 x 1080, for posts and devlogs)
  land-of-ascii-key-art.png       the main image: the fort at night
  land-of-ascii-whats-new.png     what's new in 0.6 (use with the changelog)
  land-of-ascii-villagers.png     villagers at Dunholme's well, one greeting you
  land-of-ascii-sketching.png     the journal open on six sketches
  land-of-ascii-the-land.png      dawn, midday, evening and night, in four views

tiktok/   (1080 x 1920, 9:16, for TikTok, Reels and Shorts; see tiktok/POSTING.txt)
  land-of-ascii-tiktok-letters.mp4  14 s  the land in huge letters, sharpening into the game
  land-of-ascii-tiktok-day.mp4      15 s  a day in Elmswick as a timelapse, a clock on screen
  land-of-ascii-tiktok-favour.mp4   22 s  Rose's favour, the fort at sunset, Juliana's lantern
  POSTING.txt                       captions, cover frames, hashtags, before you post

tiktok-walks/   (1080 x 1920, 30 s each, no words; see tiktok-walks/POSTING.txt)
  land-of-ascii-walk-lake-to-village.mp4   along Dunholme's lake and into the village
  land-of-ascii-walk-fort-weather.mp4      the fort from dawn to night through every weather
  land-of-ascii-walk-flock.mp4             in among the grazing flock on a misty morning
  land-of-ascii-walk-bridge.mp4            over the stone bridge across the Fennwater
  land-of-ascii-walk-night-village.mp4     into Elmswick at night, lantern in hand

itch/   (the itch.io page; see itch/UPLOAD-GUIDE.txt for which slot each goes in)
  cover-630x500.png               the cover (made to read at half size)
  cover-animated-630x500.gif      the same cover, moving (optional)
  banner-960x300.png              the banner at the top of the page
  wide-cover-1920x823.png         the wide cover itch.io uses when it features a game
  background-tile-256.png         the page's background, repeating
  screenshots/1 to 6              real screenshots, as a player sees the game
  UPLOAD-GUIDE.txt                slots, sizes to check, theme colours, the trailer link

CHANGELOG.txt
  Two sentences on what's new, for the itch.io page or a devlog.


The itch.io files carry no version number, so they can stay up. The
trailer and the images other than "what's new" carry none either.

To make it all again after an update (from the repository's folder):
  npm run build
  node tools/promo/trailer.mjs          the trailer (about 5 minutes)
  node tools/promo/check-trailer.mjs    checks it: length, size, frame rate, sound each second
  node tools/promo/stills.mjs           the images, the itch.io set and the screenshots
  node tools/promo/tiktok.mjs           the three vertical videos
  node tools/promo/tiktok-walks.mjs     the five peaceful walks
Every run gives the same pictures, byte for byte: the game's clocks and
its randomness are fixed while it is recorded. (The trailer's sound matches
to within one 16-bit step, far below hearing.)
