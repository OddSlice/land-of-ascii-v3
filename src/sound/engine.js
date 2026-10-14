// The world's sound (phase 5b): a small engine on the Web Audio API. Every
// sound is made in code (src/sound/synth.js) to the palette's numbers
// (src/sound/palette.js), and placed where its source is: panned by its
// direction from the ear and faded by its distance, as the picture fades
// things. What plays is a function of the game's clock, where you are, the
// weather and what is near; events fall due on the game's clock and are
// played on the audio clock, so nothing depends on the frame rate.
//
// The page starts silent: browsers refuse sound before the first click, so
// the audio context is made on the first click or key (unlock). The tools
// run with sound off (it is never made unless a tool asks, lab.sound).
//
// The five groups (air, water, life, player, places), the master volume and
// mute are the menu's (Sound), kept in the browser as the Display choices
// are. At most SOUND.voices sound at once, the loudest at the ear kept.
import { SOUND } from './palette.js';
import * as SY from './synth.js';
import { soundScene, around } from './scene.js';
import { weatherParams } from '../weather.js';
import { primUnder, P as KP, PT, TX } from '../world/kit.js';
import { MAT } from '../contract.js';
import { FS, S as PS, POSE } from '../world/people/figure.js';
import { AS, A as AN, APOSE, KIND } from '../world/animals/kinds.js';

const KEY = 'land-of-ascii-v3.sound';
export const SOUND_DEFAULTS = { master: SOUND.master, air: 1, water: 1, life: 1, player: 1, places: 1, muted: false };

export function loadSoundSettings() {
  const d = { ...SOUND_DEFAULTS };
  let s = null;
  try { s = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch { s = null; }
  if (s && typeof s === 'object') {
    for (const k of ['master', ...SOUND.groups]) if (typeof s[k] === 'number' && s[k] >= 0 && s[k] <= 1) d[k] = s[k];
    if (typeof s.muted === 'boolean') d.muted = s.muted;
  }
  return d;
}
export function saveSoundSettings(d) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ master: d.master, air: d.air, water: d.water, life: d.life, player: d.player, places: d.places, muted: d.muted })); } catch { /* not kept */ }
}

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hashU = (a, b, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
// how loud a source at d metres is (of its level), as the air fades it
const distGain = (d, ref, reach) => Math.min(1, ref / Math.max(d, 0.5)) * (1 - smooth(0.6 * reach, reach, d));
// the k nearest of `list` to (x, z), into `out` (reused: nothing made a frame)
function nearest(list, x, z, k, out, dist) {
  let n = 0;
  for (const it of list) {
    const d = Math.hypot(it.x - x, it.z - z);
    if (n === k && d >= dist[n - 1]) continue;
    let j = n < k ? n++ : n - 1;
    while (j > 0 && dist[j - 1] > d) { out[j] = out[j - 1]; dist[j] = dist[j - 1]; j--; }
    out[j] = it; dist[j] = d;
  }
  out.length = n;
  return out;
}
const ANIMAL = { [KIND.SHEEP]: 'sheep', [KIND.COW]: 'cattle', [KIND.HEN]: 'hens', [KIND.DUCK]: 'duck', [KIND.GULL]: 'gull', [KIND.CROW]: 'crow', [KIND.FINCH]: 'finch' };
const CALL = { sheep: SY.sheepBaa, cattle: SY.cowMoo, hens: SY.henCluck, duck: SY.duckQuack, gull: SY.gullCall, crow: SY.crowCaw, finch: SY.finchCall };

export class Sound {
  constructor(world) {
    this.world = world;
    this.settings = loadSoundSettings();
    this.allowed = false;           // the game allows it; the tools do not, unless they ask
    this.ctx = null;
    this.ms = 0;
    this.events = [];
    this.slots = new Map();          // an emitter's last slot scheduled
    this.seen = new Map();           // (animals, people) what they were last frame
    this.log = null;                 // (the tools) what played: [{ kind, group, level, at }]
    this.peak = 0; this.maxVoices = 0; this.voicesNow = 0; this.dropped = 0;
    this.walked = 0; this.steps = 0; this.lastX = NaN; this.lastZ = NaN; this.lastMode = 'walk';
    this.hourWas = NaN; this.hourAt = NaN;
    this.tmp = [];
    this.pending = [];
  }

  // ---- on, off, the settings ------------------------------------------------------------

  // Make the audio context (on a click or a key: a browser allows it then).
  unlock() {
    if (!this.allowed || this.ctx) return !!this.ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
    this.ctx = ctx;
    this.scene = soundScene(this.world);
    this.nz = SY.noiseBuffers(ctx);
    const L = SOUND.limit;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = L.threshold; this.limiter.knee.value = L.knee; this.limiter.ratio.value = L.ratio; this.limiter.attack.value = L.attack; this.limiter.release.value = L.release;
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 1024; this.meterBuf = new Float32Array(1024);
    this.out.connect(this.limiter); this.limiter.connect(this.meter); this.meter.connect(ctx.destination);
    // (and before the limiter: how near anything comes to clipping unlimited)
    this.preMeter = ctx.createAnalyser(); this.preMeter.fftSize = 1024; this.out.connect(this.preMeter);
    this.group = {};
    for (const g of SOUND.groups) { const n = ctx.createGain(); n.gain.value = this.settings[g]; n.connect(this.out); this.group[g] = n; }
    // the gate passage's echo, on the player's sounds
    const E = SOUND.steps.echo;
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 0;
    const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = E.delay; fb.gain.value = E.feedback; lp.type = 'lowpass'; lp.frequency.value = E.low;
    this.group.player.connect(this.echoIn); this.echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(this.out);
    // the beds
    this.wind = SY.windBed(ctx, this.nz, this.group.air);
    this.rain = SY.rainBed(ctx, this.nz, this.group.air);
    this.waterBeds = ['lake', 'river', 'sea'].map((kind) => { const pl = this.place('water'); return { kind, pl, bed: SY.waterBed(ctx, this.nz, pl.in, kind), ear: 0 }; });
    this.fireBeds = Array.from({ length: SOUND.fire.near }, (_, k) => { const pl = this.place('places'); return { pl, beds: { torch: SY.fireBed(ctx, this.nz, pl.in, 'torch'), hearth: SY.fireBed(ctx, this.nz, pl.in, 'hearth') }, ear: 0, k }; });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.visibility());
    return true;
  }
  get on() { return !!this.ctx; }
  // (the tools' video: what plays, as a stream to record with the picture)
  recordStream() {
    if (!this.ctx) return null;
    if (!this.dest) { this.dest = this.ctx.createMediaStreamDestination(); this.meter.connect(this.dest); }
    return this.dest.stream;
  }
  set(name, v) {
    if (name === 'muted') this.settings.muted = !!v; else this.settings[name] = Math.max(0, Math.min(1, v));
    saveSoundSettings(this.settings);
    if (this.ctx && this.group[name]) this.group[name].gain.setTargetAtTime(this.settings[name], this.ctx.currentTime, 0.05);
  }
  toggleMute() { this.set('muted', !this.settings.muted); return this.settings.muted; }
  visibility() {
    if (!this.ctx) return;
    if (document.visibilityState === 'hidden') { this.hidden = true; this.applyMaster(); setTimeout(() => { if (this.hidden && this.ctx.state === 'running') this.ctx.suspend(); }, SOUND.fade.hidden * 4000); }
    else { this.hidden = false; if (this.ctx.state !== 'running') this.ctx.resume(); this.applyMaster(); }
  }

  // A place in the world for a sound: its distance gain, its pan, its
  // low-pass (the air), into a group.
  place(group) {
    const ctx = this.ctx, g = ctx.createGain(), p = ctx.createStereoPanner(), lp = ctx.createBiquadFilter();
    g.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = SOUND.air.bright; lp.Q.value = 0.5;
    g.connect(lp); lp.connect(p); p.connect(this.group[group]);
    return { in: g, g, p, lp, group };
  }
  // put place pl at (x, z) for a source heard to `reach`: its gain at the ear (of its level)
  aim(pl, x, z, ref, reach, now, tc = 0.08) {
    const L = this.ear, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    const g = distGain(d, ref, reach);
    const lat = dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw), pan = SOUND.pan * lat / Math.max(1, Math.hypot(dx, dz));
    const f = SOUND.air.bright - (SOUND.air.bright - SOUND.air.dull) * Math.min(1, d / reach);
    if (tc <= 0) { pl.g.gain.setValueAtTime(g, now); pl.p.pan.setValueAtTime(pan, now); pl.lp.frequency.setValueAtTime(f, now); }
    else { pl.g.gain.setTargetAtTime(g, now, tc); pl.p.pan.setTargetAtTime(pan, now, tc); pl.lp.frequency.setTargetAtTime(f, now, tc); }
    return g;
  }

  applyMaster(now = this.ctx.currentTime) {
    const s = this.settings, F = SOUND.fade;
    let v = s.muted ? 0 : s.master, tc = F.unhide / 3;
    if (this.hidden) { v = 0; tc = F.hidden / 3; }
    else if (this.paused === 'menu') { v *= SOUND.duck.menu; tc = F.menu / 3; }
    else if (this.paused === 'talk') { v *= SOUND.duck.talk; tc = F.talk / 3; }
    this.out.gain.setTargetAtTime(v, now, tc);
  }

  // ---- events --------------------------------------------------------------------------

  // Play event `fn` at audio time `when` from (x, z) at level `v` (at `ref`
  // metres, heard to `reach`), if the voices allow: the loudest at the ear
  // are kept.
  play(kind, group, fn, when, x, z, v, ref, reach, r) {
    const now = this.ctx.currentTime;
    // (an event due later than the look-ahead waits its turn: a bell's strikes)
    if (when > now + SOUND.lookahead) { this.pending.push({ kind, group, fn, when, x, z, v, ref, reach, r }); return true; }
    const ear = this.ear, d = Math.hypot(x - ear.x, z - ear.z);
    const loud = v * distGain(d, ref, reach) * (this.settings[group] || 0);
    if (loud < 1e-4) return false;
    // (the voices: the beds sounding, and the events playing now)
    if (this.voicesNow >= SOUND.voices) {
      let qi = -1, q = Infinity;
      this.events.forEach((e, i) => { if (e.end > now && e.loud < q) { q = e.loud; qi = i; } });
      if (qi < 0 || q >= loud) { this.dropped++; return false; }
      const e = this.events[qi];
      e.pl.g.gain.cancelScheduledValues(now); e.pl.g.gain.setTargetAtTime(0, now, 0.02); e.end = now; this.voicesNow--;
    }
    const pl = this.place(group);
    this.aim(pl, x, z, ref, reach, when, 0);
    const end = fn(this.ctx, this.nz, pl.in, Math.max(when, now), v, r);
    this.events.push({ pl, end, loud });
    this.voicesNow++;
    if (this.voicesNow > this.maxVoices) this.maxVoices = this.voicesNow;
    if (this.log) this.log.push({ kind, group, level: +loud.toFixed(5), at: +now.toFixed(3), d: +d.toFixed(1) });
    return true;
  }
  // Events of an emitter due in slots of `every` seconds of game time: each
  // slot one at most (with chance c), at a point in it from the hash, played
  // when it comes within the look-ahead (`go(when, r)`, on the audio clock).
  // A slot is passed only once its event (if any) has been played or missed.
  due(id, every, c, gt, go) {
    const ahead = gt + SOUND.lookahead, k0 = Math.floor(gt / every);
    let k = this.slots.get(id);
    // (none yet, behind, or the clock set back: from now's slot)
    if (k === undefined || k < k0 || k > k0 + 2 + SOUND.lookahead / every) k = k0;
    for (; k * every <= ahead; k++) {
      if (hashU(id, k, 7) >= c) continue;
      const at = (k + hashU(id, k, 11) * 0.9) * every;
      if (at > ahead) break;
      if (at >= gt - 0.05) go(this.ctx.currentTime + Math.max(0, at - gt), hashU(id, k, 13));
    }
    this.slots.set(id, k);
  }

  // ---- each frame -------------------------------------------------------------------------

  // `fr`: { x, z, feet, eye, yaw, mode, flying, room, running (the player
  // runs), t (game seconds), hour, day, weather (the frame's), people,
  // lit, animals, paused: null | 'menu' | 'talk' }.
  update(fr) {
    if (!this.ctx) return;
    const t0 = performance.now();
    const ctx = this.ctx, now = ctx.currentTime, S = SOUND, W = this.world, T = W.terrain;
    this.ear = { x: fr.x, z: fr.z, yaw: fr.yaw };
    if (fr.paused !== this.paused) { this.paused = fr.paused; this.applyMaster(now); }
    else if (!this.started) { this.started = true; this.applyMaster(now); }
    // (events done: their places let go; the voices: those still playing,
    // and each bed below as it sounds)
    let live = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.end + 0.3 < now) { e.pl.p.disconnect(); this.events.splice(i, 1); } else if (e.end > now) live++;
    }
    this.voicesNow = live + (this.bedsNow || 0);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (e.when <= now + SOUND.lookahead) { this.pending.splice(i, 1); this.play(e.kind, e.group, e.fn, e.when, e.x, e.z, e.v, e.ref, e.reach, e.r); }
    }
    let beds = 0;
    const P = weatherParams(fr.weather);
    const gt = fr.t, hour = fr.hour, sea = W.sea;
    const j = Math.max(0, Math.min(T.NN * T.NN - 1, Math.round(fr.z) * T.NN + Math.round(fr.x)));
    const indoors = fr.room >= 0, forest = T.wFloor ? T.wFloor[j] / 255 : 0;
    // ---- air: the wind, the rain ----
    const Wd = S.wind, up = Math.max(0, fr.eye - sea);
    const g1 = Math.sin(2 * Math.PI * Wd.gust.rates[0] * gt + fr.x * Wd.gust.space), g2 = Math.sin(2 * Math.PI * Wd.gust.rates[1] * gt + fr.z * Wd.gust.space + 1.7), g3 = Math.sin(2 * Math.PI * Wd.gust.rates[2] * gt + 4.1);
    const gust = 1 + Wd.gust.depth * (0.5 * g1 + 0.3 * g2 + 0.2 * g3);
    const shelter = indoors ? Wd.indoors : 1 - (1 - Wd.sheltered) * Math.max(forest, 0);
    const windLevel = (Wd.level + Wd.perSpeed * Math.max(0, P.wind[0])) * (1 + Wd.high * smooth(0, 200, up)) * shelter * gust;
    this.wind.level.setTargetAtTime(windLevel, now, 0.4);
    this.wind.band.setTargetAtTime(Wd.band[0] + (Wd.band[1] - Wd.band[0]) * smooth(0.4, 1.6, gust), now, 0.5);
    this.wind.whistle.setTargetAtTime(Wd.whistle.level * smooth(Wd.whistle.from, Wd.whistle.from + 80, up) * shelter * gust, now, 0.5);
    const R = S.rain, rain = P.rain || 0;
    const rainLevel = R.level * rain * (indoors ? R.roof : forest > 0.5 ? R.under : 1);
    this.rain.level.setTargetAtTime(rainLevel, now, 0.8);
    beds += (windLevel > 1e-3 ? 1 : 0) + (rainLevel > 1e-3 ? 1 : 0);
    // ---- water: the nearest lake shore, river reach and sea edge ----
    const Wt = S.water;
    for (const wb of this.waterBeds) {
      const Pw = Wt[wb.kind], pts = around(this.scene.water[wb.kind], fr.x, fr.z, Pw.reach, this.tmp);
      let best = null, bd = Infinity;
      for (const p of pts) { const d = Math.hypot(p.x - fr.x, p.z - fr.z); if (d < bd) { bd = d; best = p; } }
      let lv = 0;
      if (best) {
        lv = Pw.level;
        if (wb.kind === 'river') {
          lv *= 1 + (Pw.rapids - 1) * smooth(0.01, 0.05, best.fall || 0);
          for (const b of this.scene.bridges) if (Math.hypot(b.x - fr.x, b.z - fr.z) < b.len / 2 + 2 && fr.feet < b.y - 0.8) lv *= Pw.bridge;
        }
        if (wb.kind === 'sea') lv *= 0.7 + 0.3 * (P.swell || 1);
        wb.ear = this.aim(wb.pl, best.x, best.z, Pw.ref, Pw.reach, now, 0.3) * lv;
      } else { wb.pl.g.gain.setTargetAtTime(0, now, 0.4); wb.ear = 0; }
      wb.bed.level.setTargetAtTime(lv * (indoors ? 0.35 : 1), now, 0.3);
      if (wb.ear > 1e-3) beds++;
    }
    // ---- fires: the nearest few, torches by night, hearths while lit ----
    const night = 1 - smooth(5.6, 7.2, hour) + smooth(18.6, 20.2, hour);
    const fires = nearest(around(this.scene.fires, fr.x, fr.z, S.fire.torch.reach, this.tmp), fr.x, fr.z, S.fire.near, this.nf || (this.nf = []), this.nfd || (this.nfd = new Float64Array(8)));
    this.fireBeds.forEach((fb, k) => {
      const f = fires[k];
      if (!f) { fb.beds.torch.level.setTargetAtTime(0, now, 0.3); fb.beds.hearth.level.setTargetAtTime(0, now, 0.3); fb.ear = 0; return; }
      const Pf = S.fire[f.kind], inRoom = f.rooms.length ? f.rooms.includes(fr.room) : fr.room < 0;
      const burning = f.kind === 'torch' ? (f.rooms.length ? 1 : Math.min(1, Math.max(0, night))) : (!f.group || (fr.lit && (fr.lit[f.group] & 4)) ? 1 : 0.15);
      const lv = Pf.level * burning * (inRoom ? 1 : 0.25);
      fb.ear = this.aim(fb.pl, f.x, f.z, Pf.ref, Pf.reach, now, 0.2) * lv;
      fb.beds[f.kind].level.setTargetAtTime(lv, now, 0.3);
      fb.beds[f.kind === 'torch' ? 'hearth' : 'torch'].level.setTargetAtTime(0, now, 0.3);
      if (fb.ear > 1e-3) beds++;
      // its pops
      if (lv > 1e-3 && gt !== this.lastGt) {
        const Pp = Pf.pop;
        this.due(9000 + f.id, Pp.every, Pp.chance, gt, (when, r) => this.play('fire', 'places', (c, n, o, tt, v, rr) => SY.firePop(c, n, o, tt, v, rr, Pp.band), when, f.x, f.z, Pp.level * lv / Pf.level, Pf.ref, Pf.reach, r));
      }
    });
    this.voicesNow += beds - (this.bedsNow || 0); this.bedsNow = beds;
    // (from here: events, only while the game's clock runs)
    const moving = gt !== this.lastGt;
    if (moving) {
      this.birds(fr, gt, hour, rain);
      this.animals(fr, gt);
      this.peopleSounds(fr, gt);
      if ((rain > 0.15 || (fr.weather && fr.weather.wet > 0.6)) && !indoors) this.drips(fr, gt, Math.max(rain, 0.3));
      this.bells(fr, hour, now);
    }
    this.footsteps(fr, now);
    // the gate passage's echo
    const G = this.scene.gate;
    let inGate = 0;
    if (G) { const dx = fr.x - G.x, dz = fr.z - G.z, u = dx * G.ox + dz * G.oz, v = -dx * G.oz + dz * G.ox; inGate = Math.abs(u) < 3.2 && Math.abs(v) < 2.2 ? 1 : 0; }
    this.echoIn.gain.setTargetAtTime(inGate * SOUND.steps.echo.wet, now, 0.15);
    this.lastGt = gt;
    this.maxVoices = Math.max(this.maxVoices, this.voicesNow);
    // (the tools: the loudest sample just played)
    if (this.log) {
      this.meter.getFloatTimeDomainData(this.meterBuf);
      let m = 0; for (let i = 0; i < this.meterBuf.length; i++) { const a = Math.abs(this.meterBuf[i]); if (a > m) m = a; }
      if (m > this.peak) this.peak = m;
      this.preMeter.getFloatTimeDomainData(this.meterBuf);
      let m2 = 0; for (let i = 0; i < this.meterBuf.length; i++) { const a = Math.abs(this.meterBuf[i]); if (a > m2) m2 = a; }
      if (m2 > (this.prePeak || 0)) this.prePeak = m2;
      this.bedLog = { wind: windLevel, rain: rainLevel, lake: this.waterBeds[0].ear, river: this.waterBeds[1].ear, sea: this.waterBeds[2].ear, fire: Math.max(...this.fireBeds.map((f) => f.ear)), echo: inGate * SOUND.steps.echo.wet };
    }
    this.ms = performance.now() - t0;
    // (the tools: what a slow frame was doing)
    if (this.log && this.ms > 0.5) (this.spikes || (this.spikes = [])).push({ ms: +this.ms.toFixed(2), events: this.events.length, pending: this.pending.length, played: this.log.length, voices: this.voicesNow });
  }

  // songbirds at the edges of stands and copses, by the hour
  birds(fr, gt, hour, rain) {
    const B = SOUND.birds, Sg = B.song;
    const ch = B.chorus, chorus = Math.max(smooth(ch.dawn[0], ch.dawn[0] + 0.6, hour) * (1 - smooth(ch.dawn[1] - 0.8, ch.dawn[1], hour)), smooth(ch.dusk[0], ch.dusk[0] + 0.5, hour) * (1 - smooth(ch.dusk[1] - 0.6, ch.dusk[1], hour)));
    const day = smooth(ch.dawn[0], ch.dawn[1], hour) * (1 - smooth(ch.dusk[0], ch.dusk[1], hour));
    const c = (Sg.chance[0] * day + (Sg.chance[1] - Sg.chance[0]) * chorus) * (1 - 0.7 * smooth(0.1, 0.6, rain));
    if (c <= 0.001) return;
    const trees = nearest(around(this.scene.trees, fr.x, fr.z, Sg.reach, this.tmp), fr.x, fr.z, B.near, this.nt || (this.nt = []), this.ntd || (this.ntd = new Float64Array(8)));
    for (const t of trees) this.due(100000 + t.id, Sg.every, c, gt, (when, r) => this.play('birdsong', 'life', (cx, n, o, tt, v, rr) => SY.birdSong(cx, n, o, tt, v, rr, (t.id % 97) / 97), when, t.x, t.z, Sg.level, Sg.ref, Sg.reach, r));
  }

  // the animals' own calls, from where they are drawn
  animals(fr, gt) {
    const st = fr.animals;
    if (!st) return;
    const n = st.length / AS, A = SOUND.animals, Bd = SOUND.birds;
    for (let i = 0; i < n; i++) {
      const o = i * AS, kind = st[o + AN.KIND], pose = st[o + AN.POSE];
      if (pose === APOSE.HIDDEN) continue;
      const x = st[o + AN.X], z = st[o + AN.Z], d = Math.hypot(x - fr.x, z - fr.z), id = st[o + AN.ID] | 0;
      if (d > 180) continue;
      if (kind === KIND.DOG) {
        // a bark as you come near it, once (again only after you have gone)
        const armed = this.seen.get(3e6 + id) !== false;
        if (armed && d < A.dog.near) { this.play('dog', 'life', SY.dogBark, this.ctx.currentTime + 0.05, x, z, A.dog.level, A.dog.ref, A.dog.reach, hashU(id, Math.floor(gt), 3)); this.seen.set(3e6 + id, false); }
        else if (!armed && d > A.dog.near * 1.8) this.seen.set(3e6 + id, true);
        continue;
      }
      if (kind === KIND.DEER) {
        const was = this.seen.get(2e6 + id);
        if (pose === APOSE.RUN && was !== APOSE.RUN && st[o + AN.SPARE] === 0) this.play('deer', 'life', SY.deerBreak, this.ctx.currentTime + 0.02, x, z, A.deer.level, A.deer.ref, A.deer.reach, hashU(id, Math.floor(gt), 5));
        this.seen.set(2e6 + id, pose);
        continue;
      }
      const name = ANIMAL[kind];
      if (!name) continue;
      const Pk = A[name] || Bd[name];
      if (d > Pk.reach) continue;
      // (perched and flying birds call; ground birds and beasts as they graze or stand)
      if (pose === APOSE.LIE && kind !== KIND.SHEEP && kind !== KIND.COW) continue;
      this.due(200000 + id, Pk.every, Pk.chance, gt, (when, r) => this.play(name, 'life', CALL[name], when, x, z, Pk.level, Pk.ref, Pk.reach, r));
    }
  }

  // the people: a well drawn from, a door's latch
  peopleSounds(fr, gt) {
    const st = fr.people;
    if (!st) return;
    const n = st.length / FS, Wl = SOUND.well, La = SOUND.latch;
    for (let i = 0; i < n; i++) {
      const o = i * FS, x = st[o + PS.X], z = st[o + PS.Z], d = Math.hypot(x - fr.x, z - fr.z);
      // (in or out: a room's door, or a closed door one is hidden behind)
      const pose = st[o + PS.POSE], inside = pose === POSE.HIDDEN || st[o + PS.ROOM] >= 0, key = 1e6 + i, was = this.seen.get(key);
      if (was !== undefined && was.inside !== inside && Math.hypot(was.x - fr.x, was.z - fr.z) < La.reach) this.play('latch', 'places', SY.latch, this.ctx.currentTime + 0.02, was.x, was.z, La.level, La.ref, La.reach, hashU(i, Math.floor(gt), 9));
      if (!was) this.seen.set(key, { inside, x, z });
      else if (pose !== POSE.HIDDEN) { was.inside = inside; was.x = x; was.z = z; } else was.inside = true;
      if (d > Wl.reach || pose === POSE.HIDDEN || pose === POSE.WALK) continue;
      for (const w of this.scene.wells) if (Math.hypot(w.x - x, w.z - z) < 3.2) this.due(300000 + i, Wl.every, 0.7, gt, (when, r) => this.play('well', 'places', SY.wellDraw, when, w.x, w.z, Wl.level, Wl.ref, Wl.reach, r));
    }
  }

  // drips off the leaves near you in rain
  drips(fr, gt, k) {
    const D = SOUND.rain.drip;
    const trees = around(this.scene.trees, fr.x, fr.z, D.near * 3, this.tmp);
    let tx = fr.x, tz = fr.z, any = false;
    for (const t of trees) { if (Math.hypot(t.x - fr.x, t.z - fr.z) < D.near * 3) { tx = t.x; tz = t.z; any = true; break; } }
    if (!any && !(this.world.terrain.wFloor && this.world.terrain.wFloor[Math.round(fr.z) * this.world.terrain.NN + Math.round(fr.x)] > 120)) return;
    this.due(400000, D.every, 0.6 * k, gt, (when, r) => this.play('drip', 'air', SY.drip, when, tx + (r - 0.5) * 6, tz + (hashU(r * 1e6, 3) - 0.5) * 6, D.level, 3, D.near * 3, r));
  }

  // the chapels' bells: the hour's count, as the hour turns
  bells(fr, hour, now) {
    const Bl = SOUND.bell, h = Math.floor(hour);
    // (only as the clock runs into the hour: not when the time is set)
    const ran = hour - this.hourAt > 0 && hour - this.hourAt < 0.25;
    this.hourAt = hour;
    if (ran && h !== this.hourWas && h >= Bl.hours[0] && h <= Bl.hours[1]) {
      const count = h % 12 || 12;
      for (const c of this.scene.chapels) {
        const d = Math.hypot(c.x - fr.x, c.z - fr.z);
        if (d > Bl.reach) continue;
        for (let k = 0; k < count; k++) this.play('bell', 'places', (cx, n, o, tt, v) => SY.bellStrike(cx, o, tt, v), now + 0.1 + k * Bl.apart, c.x, c.z, Bl.level, Bl.ref, Bl.reach, 0);
      }
    }
    this.hourWas = h;
  }

  // footsteps at the walk's stride, by what is underfoot
  footsteps(fr, now) {
    const St = SOUND.steps;
    if (Number.isNaN(this.lastX) || fr.teleport) { this.lastX = fr.x; this.lastZ = fr.z; this.lastMode = fr.mode; return; }
    const d = Math.hypot(fr.x - this.lastX, fr.z - this.lastZ), dtA = Math.max(1e-3, now - (this.lastNow || now - 0.016));
    this.lastX = fr.x; this.lastZ = fr.z; this.lastNow = now;
    // (running: Shift held, or simply moving at a run)
    const running = fr.running || d / dtA > 5.8;
    const was = this.lastMode; this.lastMode = fr.mode;
    if (fr.flying) return;
    if ((was === 'jump' || was === 'fall') && (fr.mode === 'walk' || fr.mode === 'wade')) this.play('land', 'player', SY.landing, now, fr.x, fr.z, St.land.level, 1, 30, 0);
    if (d > 3 || fr.mode === 'jump' || fr.mode === 'fall' || fr.mode === 'swim') return;
    this.walked += d;
    const half = (running ? St.runStride : St.stride) / 2;
    if (this.walked < half) return;
    this.walked -= half;
    if (this.walked > half) this.walked = 0;
    this.steps++;
    const r = hashU(this.steps, 77), v = St.level * (running ? St.run : 1);
    // what is underfoot
    const W = this.world, T = W.terrain, j = Math.round(fr.z) * T.NN + Math.round(fr.x);
    let m = 'meadow', creak = false;
    if (fr.mode === 'wade') m = 'water';
    else {
      const q = primUnder(W.kit, fr.x, fr.z, fr.feet);
      if (q >= 0) {
        const S = W.kit.prims, mat = S[q + KP.MAT], tex2 = S[q + KP.TEX2], stair = S[q + KP.TYPE] === PT.STAIR;
        const wood = tex2 === TX.BOARDS || mat === MAT.TIMBER || mat === MAT.TIMBER2 || mat === MAT.TIMBER3 || mat === MAT.WOOD;
        m = wood ? 'timber' : 'stone';
        // (a stair creaks, and a timber floor indoors now and then)
        creak = stair || (wood && fr.room >= 0);
      } else if (T.wSnow && T.wSnow[j] > 128) m = 'snow';
      else if (T.wSand && T.wSand[j] > 128) m = 'sand';
      else if ((T.wRoad && T.wRoad[j] > 100) || (T.wPath && T.wPath[j] > 100) || (T.wYard && T.wYard[j] > 100)) m = 'road';
      else if (T.wRock && T.wRock[j] > 160) m = 'stone';
    }
    this.underfoot = m;
    this.play(`step:${m}`, 'player', (c, n, o, t, vv, rr) => SY.footstep(c, n, o, t, vv, St[m], rr), now, fr.x, fr.z, v, 1, 30, r);
    if (m === 'water') this.play('splash', 'player', SY.splash, now + 0.03, fr.x, fr.z, St.splash.level * (running ? 1.4 : 1), 1, 30, r);
    if (creak && this.steps % St.creak.every === 0) this.play('creak', 'player', SY.creak, now + 0.02, fr.x, fr.z, St.creak.level, 1, 30, r);
  }
}
