// Frame pacing for the render workers.
//
// A frame shows the camera as it was when the frame was asked for. If some
// frames reach the screen one display refresh after they were asked for and
// others two, the view stalls for a refresh and then jumps to catch up:
// turning feels as if it skips now and then. So:
// - every frame is shown exactly `lag` refreshes after it was asked for;
// - a frame is asked for every `every` refreshes (1 at full rate);
// - up to `lag` frames may be in flight, so the workers start the next
//   frame while the page waits for the rest of this one;
// - a frame that comes back after its refresh is dropped, not shown late:
//   shown late, it would put the view a refresh behind, and the next would
//   jump to catch up. Dropped, the view holds a moment and goes on where it
//   should be, as a video player drops a frame.
// The view then moves on by the same time from frame to frame, at a steady
// frame rate: the display's own when the workers keep up, half of it when
// they cannot, never a mix.
//
// `every` is the fewest refreshes the workers keep up with on average (with
// frames overlapping, a slow one is absorbed by the next); frames that wait
// behind the one before also mean they are not keeping up. It goes up when
// the workers' average stops fitting with 0.7 ms to spare, and comes back
// after a second in which it fits with 1.8 ms to spare, so it does not flap.
//
// `lag` follows `every`, and is not measured: every change of it is itself a
// small jump or stall. It is the 16.7 ms a 60 Hz display takes for one
// refresh: two refreshes on a fast display (over 90 Hz), one on a 60 Hz one;
// one more when frames are asked for every second refresh. A frame that
// comes back later than that is dropped (above).
const MAX_EVERY = 2;

const quantile = (list, q) => { const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

export class Pacer {
  constructor() {
    this.every = 1;
    this.lag = 1;
    this.fixed = null;        // lab.setPace(every, lag): hold them there (for measuring)
    this.tick = 0;
    this.lastSent = -Infinity;
    this.refresh = 1000 / 60;
    this.gaps = [];           // recent intervals between display refreshes
    this.works = [];          // recent slowest-stripe times (ms)
    this.trips = [];          // recent round trips, ms from asking to every stripe back
    this.warm = 30;           // frames to show before judging: the very first are slow (start-up)
    this.sinceShown = 0;      // refreshes since a frame was last shown
    this.last = 0;
  }

  // Once per display refresh, with requestAnimationFrame's time.
  onRefresh(now) {
    if (this.last) {
      this.gaps.push(now - this.last);
      if (this.gaps.length > 30) this.gaps.shift();
      this.refresh = quantile(this.gaps, 0.5);
      if (!this.fixed) this.lag = this.minLag;
    }
    this.last = now;
    this.tick++;
    this.sinceShown++;
  }

  // The lag: two refreshes on a fast display, one on a 60 Hz one, one more
  // when frames are asked for every second refresh.
  get minLag() { return (this.refresh < 11 ? 2 : 1) + (this.every - 1); }

  // Has the refresh of a frame asked for in refresh `tag` passed?
  late(tag) { return this.tick > tag + this.lag; }

  // Is a frame asked for in refresh `tag` due on screen now?
  due(tag) { return this.tick >= tag + this.lag; }

  // Should a frame be asked for in this refresh, with `inFlight` already out?
  shouldSend(inFlight) { return this.tick - this.lastSent >= this.every && inFlight < this.lag; }

  sent() { this.lastSent = this.tick; }

  // A frame asked for in refresh `tag` was shown; `trip` its round trip,
  // `work` its slowest stripe.
  shown(tag, trip, work) {
    if (this.fixed) { [this.every, this.lag] = this.fixed; return; }
    this.lag = this.minLag;
    if (this.warm > 0) { this.warm--; return; }
    this.trips.push(trip); this.works.push(work);
    if (this.trips.length > 120) { this.trips.shift(); this.works.shift(); }
    if (this.trips.length < 10) return;
    const R = this.refresh;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const recentWorks = this.works.slice(-30), recentTrips = this.trips.slice(-30);
    // how long frames usually wait behind the one before (the median, so one
    // slow frame and the few queued behind it do not count)
    const wait = quantile(recentTrips.map((x, i) => x - recentWorks[i]), 0.5);
    let change = 0;
    if (this.every < MAX_EVERY && (mean(recentWorks) > this.every * R - 0.7 || wait > 0.5 * R)) change = 1;
    // (workers idling between frames run slower, so coming back allows a little)
    else if (this.every > 1 && this.trips.length >= 60 && mean(this.works) < (this.every - 1) * R - 1.8 && mean(this.trips) - mean(this.works) < 0.2 * R) change = -1;
    if (change) {
      this.every += change;
      this.lag = this.minLag;
      this.trips.length = 0; this.works.length = 0;
    }
  }

}
