// The promo recorder's control of a game page (the trailer, the stills):
// loaded before the game's own script (Playwright's addInitScript), it
//  - seeds Math.random, so every run makes the same choices;
//  - holds the game's clocks: performance.now, Date and the time an
//    animation frame is handed all stand at 0 while the page loads (the
//    world is built in a worker, and frames and timers still come on real
//    time, so the page gets ready; but no game time passes, so the title's
//    flyover, the animation clock and the hour start the same on every
//    run). `__promo.hold()` then takes requestAnimationFrame, setTimeout
//    and setInterval over too, and from there time moves only in
//    `__promo.step()`: exactly 1/60 s a call, every timer due and the
//    game's frame run in it, so a frame takes as long as it needs and the
//    picture is the same on every run;
//  - optionally (`audio: seconds`) gives the game an OfflineAudioContext in
//    place of a live AudioContext, kept in step with the frames: each step
//    renders the audio up to that frame's time and the game's sound is
//    updated there, so the game's own engine makes the trailer's sound,
//    sample-exact with the picture;
//  - turns CSS transitions and animations off (a fade would run on real
//    time, not the stepped clock; anything that should fade is drawn).
//
//   page.addInitScript(clockScript({ seed: 7, audio: 31 }))

export function clockScript(cfg = {}) {
  return `(${install.toString()})(${JSON.stringify({ seed: 1, epoch: Date.UTC(2026, 9, 16, 7, 0), audio: 0, rate: 48000, ...cfg })});`;
}

function install(cfg) {
  // ---- seeded randomness (mulberry32) ----
  let s = cfg.seed >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- the clocks ----
  const real = {
    now: performance.now.bind(performance), raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window), si: window.setInterval.bind(window), ct: window.clearTimeout.bind(window), ci: window.clearInterval.bind(window),
  };
  const P = { held: false, now: 0, frame: 0, timers: new Map(), rafs: new Map(), next: 1e9, audio: null };
  window.__promo = P;
  performance.now = () => P.now;
  const RealDate = Date;
  const nowMs = () => cfg.epoch + P.now;
  function FakeDate(...a) { if (!new.target) return new RealDate(nowMs()).toString(); return a.length ? new RealDate(...a) : new RealDate(nowMs()); }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => Math.floor(nowMs());
  FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  window.Date = FakeDate;

  window.requestAnimationFrame = (fn) => {
    if (!P.held) return real.raf(() => fn(P.now));
    const id = P.next++; P.rafs.set(id, fn); return id;
  };
  window.cancelAnimationFrame = (id) => { if (P.rafs.delete(id)) return; real.caf(id); };
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!P.held) return real.st(fn, ms, ...args);
    const id = P.next++; P.timers.set(id, { at: P.now + Math.max(0, +ms || 0), fn, args, every: 0 }); return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    if (!P.held) return real.si(fn, ms, ...args);
    const id = P.next++; P.timers.set(id, { at: P.now + Math.max(1, +ms || 0), fn, args, every: Math.max(1, +ms || 0) }); return id;
  };
  window.clearTimeout = (id) => { if (P.timers.delete(id)) return; real.ct(id); };
  window.clearInterval = (id) => { if (P.timers.delete(id)) return; real.ci(id); };

  // ---- the audio ----
  if (cfg.audio > 0) {
    const ctx = new OfflineAudioContext(2, Math.ceil(cfg.audio * cfg.rate), cfg.rate);
    P.audio = { ctx, started: false, t0: null, done: null };
    const AC = function () { return ctx; };
    window.AudioContext = AC; window.webkitAudioContext = AC;
  }

  // ---- no CSS motion ----
  const still = () => { const st = document.createElement('style'); st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'; document.documentElement.append(st); };
  if (document.documentElement) still(); else addEventListener('DOMContentLoaded', still);

  const macrotask = () => new Promise((r) => real.st(r, 0));
  // Stop the clocks (after the page has loaded and the world is built).
  P.hold = async () => {
    P.held = true;
    await new Promise((r) => real.st(r, 120));     // (a frame already asked of the real clock comes and goes)
  };
  // Start the audio clock at this frame: audio time 0 is now.
  P.audioStart = () => { if (P.audio) P.audio.t0 = P.now; };
  // One frame: the clock moves 1/60 s, the timers due run, the audio is
  // rendered up to this time, then the game's frame runs.
  P.step = async (ms = 1000 / 60) => {
    P.now += ms; P.frame++;
    for (let guard = 0; guard < 200; guard++) {
      let id = null, best = Infinity;
      for (const [k, t] of P.timers) if (t.at <= P.now && t.at < best) { best = t.at; id = k; }
      if (id === null) break;
      const t = P.timers.get(id);
      if (t.every) t.at += t.every; else P.timers.delete(id);
      try { t.fn(...t.args); } catch (e) { console.error(e); }
      await macrotask();
    }
    const A = P.audio;
    if (A && A.t0 !== null) {
      const at = (P.now - A.t0) / 1000;
      if (at > 0 && at < A.ctx.length / A.ctx.sampleRate - 0.05) {
        const reached = A.ctx.suspend(at);
        if (!A.started) { A.started = true; A.done = A.ctx.startRendering(); } else A.ctx.resume();
        await reached;
      }
    }
    const list = [...P.rafs.values()]; P.rafs.clear();
    for (const fn of list) { try { fn(P.now); } catch (e) { console.error(e); } }
    await macrotask();
  };
  // Finish the audio: render the rest, and give it back as 16-bit PCM WAV
  // in base64 pieces (the page hands them to Node one at a time).
  P.finishAudio = async () => {
    const A = P.audio;
    if (!A || !A.started) return 0;
    A.ctx.resume();
    const buf = await A.done;
    const n = buf.length, ch = buf.numberOfChannels, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, str) => { for (let i = 0; i < str.length; i++) data.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
    data.setUint16(22, ch, true); data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    w(36, 'data'); data.setUint32(40, n * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    const bytes = new Uint8Array(data.buffer), CH = 1 << 20;
    P.wav = [];
    for (let i = 0; i < bytes.length; i += CH) { let bin = ''; const part = bytes.subarray(i, i + CH); for (let j = 0; j < part.length; j += 8192) bin += String.fromCharCode.apply(null, part.subarray(j, j + 8192)); P.wav.push(btoa(bin)); }
    return P.wav.length;
  };
}
