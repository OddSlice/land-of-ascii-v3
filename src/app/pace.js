// Frame pacing for the render workers.
//
// A frame shows the camera as it was when the frame was asked for. If some
// frames reach the screen one display refresh after they were asked for and
// others two, the view stalls for a refresh and then jumps to catch up:
// turning feels as if it skips now and then. So:
// - every frame is shown exactly `lag` refreshes after it was asked for;
// - a frame is asked for every `every` refreshes (1 at full rate);
// - up to `lag` frames may be in flight, so the workers start the next
//   frame while the page waits for the rest of this one.
// The view then moves on by the same time from frame to frame, at a steady
// frame rate: the display's own when the workers keep up, half of it when
// they cannot, never a mix.
//
// `every` is the fewest refreshes the workers keep up with on average (with
// frames overlapping, a slow one is absorbed by the next); frames that wait
// behind the one before also mean they are not keeping up. It goes up when
// the workers' average stops fitting with 0.7 ms to spare, and comes back
// when it fits with 1.8 ms to spare. `lag` is the
// fewest refreshes, at least `every`, that 90% of round trips fit in, waits
// for the worker included; on a fast display (over 90 Hz) it is never under
// two, the 16.7 ms a 60 Hz display takes for one. Either goes up when that
// stops fitting for most frames; a rare slow frame (a worker's garbage
// collection) costs one late frame but is not a reason, since every change
// of `lag` is itself a small jump. `every` comes down after a second in
// which frames would have fitted one refresh less, `lag` after two seconds,
// so they do not flap.
// At most every second refresh: half the display's rate is the floor (a
// steady 40 fps reads worse than 60 with the odd late frame).
const MAX_EVERY = 2, MAX_LAG = 4;

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
    this.missed = [];         // 1 where a frame came back after its refresh
    this.warm = 30;           // frames to show before judging: the very first are slow (start-up)
    this.last = 0;
  }

  // Once per display refresh, with requestAnimationFrame's time.
  onRefresh(now) {
    if (this.last) {
      this.gaps.push(now - this.last);
      if (this.gaps.length > 30) this.gaps.shift();
      this.refresh = quantile(this.gaps, 0.5);
    }
    this.last = now;
    this.tick++;
  }

  // The least lag: two refreshes on a fast display, one on a 60 Hz one.
  get minLag() { return this.refresh < 11 ? 2 : 1; }

  // Is a frame asked for in refresh `tag` due on screen now?
  due(tag) { return this.tick >= tag + Math.max(this.lag, this.minLag); }

  // Should a frame be asked for in this refresh, with `inFlight` already out?
  shouldSend(inFlight) { return this.tick - this.lastSent >= this.every && inFlight < Math.max(this.lag, this.minLag); }

  sent() { this.lastSent = this.tick; }

  // A frame asked for in refresh `tag` was shown; `trip` its round trip,
  // `work` its slowest stripe.
  shown(tag, trip, work) {
    if (this.fixed) { [this.every, this.lag] = this.fixed; return; }
    if (this.warm > 0) { this.warm--; return; }
    if (this.lag < this.minLag) this.lag = this.minLag;
    this.missed.push(this.tick > tag + this.lag ? 1 : 0);
    this.trips.push(trip); this.works.push(work);
    if (this.trips.length > 120) { this.trips.shift(); this.works.shift(); this.missed.shift(); }
    const R = this.refresh;
    const clear = () => { this.trips.length = 0; this.works.length = 0; this.missed.length = 0; };
    if (this.trips.length < 10) return;
    const recentWorks = this.works.slice(-30), recentTrips = this.trips.slice(-30);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const wMean = mean(recentWorks), t90 = quantile(recentTrips, 0.9);
    // how long frames usually wait behind the one before (the median, so one
    // slow frame and the few queued behind it do not count)
    const wait = quantile(recentTrips.map((x, i) => x - recentWorks[i]), 0.5);
    if (this.every < MAX_EVERY && (wMean > this.every * R - 0.7 || wait > 0.5 * R)) {
      this.every++;
      this.lag = Math.max(this.every, this.minLag);
      clear();
    } else if (this.lag < MAX_LAG && t90 > this.lag * R - 1) {
      this.lag++;
      clear();
    } else if (this.every > 1 && this.trips.length >= 60 && mean(this.works) < (this.every - 1) * R - 1.8 && mean(this.trips) - mean(this.works) < 0.2 * R) {
      // (workers idling between frames run slower, so this allows a little)
      this.every--;
      this.lag = Math.max(this.every, this.minLag);
      clear();
    } else if (this.trips.length >= 120) {
      if (this.lag > Math.max(this.every, this.minLag) && quantile(this.trips, 0.95) < (this.lag - 1) * R - 1.5) {
        this.lag--;
        clear();
      }
    }
  }
}
