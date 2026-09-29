/* sounds.js — procedural Web Audio SFX + ambient music for Neon Bastion.
 * No audio files, no dependencies: every sound is synthesized at runtime so
 * the game stays dependency-free and works from file:// or a local server.
 */

const Sound = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  _noiseBuf: null,
  musicTimer: null,
  muted: false,
  ready: false,

  /* ---------- setup (lazy — created on first user gesture for autoplay) ---------- */
  init() {
    if (this.ready || (!window.AudioContext && !window.webkitAudioContext))
      return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    this.ready = true;

    // Browsers block audio until a user gesture; resume on the first one.
    const go = () => this.resume();
    ["click", "keydown", "pointerdown", "touchstart"].forEach((e) =>
      window.addEventListener(e, go, { once: true, passive: true }),
    );
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  _ensure() {
    this.init();
    this.resume();
    if (this.muted) return false;
    return true;
  },

  /* ---------- low-level voices ---------- */
  _noiseBufFn() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  },

  /* pitched voice: freqs number or [start,end] sweep, optional lowpass filter */
  tone(o) {
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || "sine";
    const f0 = Array.isArray(o.freqs) ? o.freqs[0] : o.freqs;
    const f1 = Array.isArray(o.freqs) ? o.freqs[1] : f0;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + o.dur);

    const atk = o.attack != null ? o.attack : 0.004;
    const rel = o.release != null ? o.release : 0.07;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur + rel);

    osc.connect(g);
    let dest = o.dest || this.sfxGain;
    if (o.filterFreq) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = o.filterType || "lowpass";
      flt.frequency.setValueAtTime(o.filterFreq, t0);
      if (o.filterQ != null) flt.Q.value = o.filterQ;
      g.connect(flt);
      flt.connect(dest);
    } else {
      g.connect(dest);
    }
    osc.start(t0);
    osc.stop(t0 + o.dur + rel + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  },

  /* noise burst through a sweeping lowpass — used for impacts/explosions */
  noise(o) {
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBufFn();
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(Math.max(20, o.c0), t0);
    if (o.c1 != null && o.c1 !== o.c0)
      flt.frequency.exponentialRampToValueAtTime(
        Math.max(20, o.c1),
        t0 + o.dur,
      );
    flt.Q.value = o.q || 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(o.dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
    src.onended = () => {
      src.disconnect();
      flt.disconnect();
      g.disconnect();
    };
  },

  /* ---------- SFX ---------- */
  place() {
    if (!this._ensure()) return;
    this.tone({ freqs: [330, 660], dur: 0.14, type: "triangle", vol: 0.16 });
    this.noise({ c0: 900, c1: 300, dur: 0.08, vol: 0.05 });
  },

  /* per-tower-type firing sound */
  shoot(type) {
    if (!this._ensure()) return;
    switch (type) {
      case "cannon":
        this.tone({ freqs: [260, 80], dur: 0.24, type: "triangle", vol: 0.2 });
        this.noise({ c0: 700, c1: 160, dur: 0.18, vol: 0.12 });
        break;
      case "tesla": // handled separately by fireTesla()
        break;
      case "frost":
        this.tone({ freqs: [1250, 1560], dur: 0.13, type: "sine", vol: 0.1 });
        break;
      default: // turret — crisp rapid pew
        this.tone({
          freqs: [940, 470],
          dur: 0.11,
          type: "triangle",
          vol: 0.11,
        });
    }
  },

  tesla() {
    if (!this._ensure()) return;
    // electric buzz: detuned sawtooths + sweeping bandpass + crackle
    this.tone({
      freqs: [720, 130],
      dur: 0.26,
      type: "sawtooth",
      vol: 0.13,
      filterFreq: 2200,
      filterQ: 6,
    });
    this.tone({
      freqs: [690, 120],
      dur: 0.26,
      type: "square",
      vol: 0.05,
      filterFreq: 1800,
      filterQ: 4,
    });
    this.noise({ c0: 3500, c1: 900, dur: 0.2, vol: 0.1, q: 1.2 });
  },

  rail() {
    if (!this._ensure()) return;
    // charging whine up, then a cracking rail discharge + thunder body
    this.tone({
      freqs: [220, 1500],
      dur: 0.12,
      type: "sawtooth",
      vol: 0.09,
      filterFreq: 3200,
      filterQ: 2,
    });
    this.tone({
      freqs: [1500, 220],
      dur: 0.22,
      type: "square",
      vol: 0.06,
      filterFreq: 2400,
      filterQ: 3,
    });
    this.noise({ c0: 5200, c1: 800, dur: 0.28, vol: 0.14, q: 1.4 });
    this.tone({ freqs: [120, 60], dur: 0.3, type: "sine", vol: 0.18 });
  },

  /* projectile impact */
  hit(type) {
    if (!this._ensure()) return;
    const cold = type === "frost";
    this.tone({
      freqs: cold ? [620, 420] : [520, 300],
      dur: 0.06,
      type: "square",
      vol: cold ? 0.07 : 0.05,
    });
    this.noise({ c0: 1400, c1: 500, dur: 0.05, vol: 0.04 });
  },

  explosion() {
    if (!this._ensure()) return;
    this.tone({ freqs: [150, 40], dur: 0.34, type: "sine", vol: 0.32 });
    this.noise({ c0: 900, c1: 120, dur: 0.4, vol: 0.4 });
  },

  kill() {
    if (!this._ensure()) return;
    // tiny success chime
    this.tone({ freqs: [880, 880], dur: 0.1, type: "sine", vol: 0.1 });
    this.tone({
      freqs: [1320, 1320],
      dur: 0.1,
      type: "sine",
      vol: 0.06,
      delay: 0.02,
    });
  },

  baseHit() {
    if (!this._ensure()) return;
    this.tone({ freqs: [170, 40], dur: 0.5, type: "sine", vol: 0.36 });
    this.tone({ freqs: [90, 40], dur: 0.5, type: "square", vol: 0.12 });
    this.noise({ c0: 600, c1: 70, dur: 0.5, vol: 0.45 });
  },

  waveStart() {
    if (!this._ensure()) return;
    this.tone({
      freqs: [220, 700],
      dur: 0.32,
      type: "triangle",
      vol: 0.14,
      filterFreq: 2400,
    });
    this.noise({ c0: 2600, c1: 800, dur: 0.3, vol: 0.08 });
  },

  waveClear() {
    if (!this._ensure()) return;
    // ascending minor-major arpeggio (victory)
    const notes = [220, 261.63, 329.63, 440, 523.25];
    notes.forEach((f, i) =>
      this.tone({
        freqs: [f, f],
        dur: 0.22,
        type: "triangle",
        vol: 0.13,
        delay: i * 0.11,
      }),
    );
  },

  upgrade() {
    if (!this._ensure()) return;
    this.tone({ freqs: [440, 990], dur: 0.24, type: "triangle", vol: 0.15 });
    this.tone({
      freqs: [880, 1980],
      dur: 0.16,
      type: "sine",
      vol: 0.07,
      delay: 0.05,
    });
  },

  sell() {
    if (!this._ensure()) return;
    this.tone({ freqs: [720, 300], dur: 0.16, type: "square", vol: 0.12 });
    this.noise({ c0: 2600, c1: 900, dur: 0.1, vol: 0.05 });
  },

  pick() {
    if (!this._ensure()) return;
    this.tone({ freqs: [520, 640], dur: 0.06, type: "triangle", vol: 0.07 });
  },

  fail() {
    if (!this._ensure()) return;
    this.tone({ freqs: [210, 120], dur: 0.15, type: "square", vol: 0.12 });
  },

  gameOver() {
    if (!this._ensure()) return;
    // descending melancholy figure
    const notes = [523.25, 440, 392, 329.63, 261.63];
    notes.forEach((f, i) =>
      this.tone({
        freqs: [f, f],
        dur: 0.4,
        type: "sine",
        vol: 0.13,
        delay: i * 0.18,
      }),
    );
  },

  /* ---------- ambient music (soft cross-faded pad) ---------- */
  startMusic() {
    this.resume();
    if (this.musicTimer || !this._ensure()) return;
    const scale = [220, 261.63, 293.66, 329.63, 392, 440]; // A-minor-ish colors
    const bass = [110, 146.83, 98];
    let i = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const top = scale[i % scale.length] * (Math.random() < 0.5 ? 1 : 2);
      this.tone({
        freqs: [top, top],
        dur: 1.0,
        type: "triangle",
        vol: 0.1,
        dest: this.musicGain,
        attack: 0.45,
        release: 0.6,
        filterFreq: 1400,
      });
      if (i % 4 === 0)
        this.tone({
          freqs: [bass[(i / 4) % bass.length], bass[(i / 4) % bass.length]],
          dur: 2.2,
          type: "sine",
          vol: 0.16,
          dest: this.musicGain,
          attack: 0.5,
          release: 1.0,
          filterFreq: 700,
        });
      i++;
    }, 500);
  },

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  },

  /* ---------- mute control ---------- */
  toggle() {
    this.setMuted(!this.muted);
  },

  setMuted(m) {
    this.muted = m;
    if (!this.ready) return; // voice/noise() will honor the flag once audio starts
    const t = this.ctx.currentTime + 0.01;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.08);
    const b = document.getElementById("muteBtn");
    if (b) b.textContent = m ? "🔇" : "🔊";
  },
};

Sound.init();
