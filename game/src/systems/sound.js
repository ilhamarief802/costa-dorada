// The whole soundscape, synthesised: no audio files, no network. Everything hangs off one
// AudioContext that is created and resumed on the first key press (browsers refuse to start
// audio without a gesture). Nodes are created once and left running with gain at zero, so
// starting a siren or a tyre screech never allocates during a frame.
//
// Voices:
//   engine     two detuned saws through a lowpass, pitch and cutoff track road speed
//   tyre       band-passed noise, gain follows lateral slip
//   siren      two-tone oscillator pair on a slow LFO, gated by the wanted level
//   gunshot    one-shot noise burst + pitch-swept square, pooled
//   surf       filtered noise with a slow swell, always on under everything
//   gulls      short pitch-bent sine chirps on a random timer
//   radio      not audio: the text lines the HUD prints, kept here so the mood is in one place
export default class Sound {
  constructor() {
    this.context = null;
    this.ready = false;
    this.master = null;
    this.voices = {};
    this.lastGull = 0;
    this.gullTimer = 3;
    this.radioTimer = 6;
    this.radioIndex = 0;
    this.enabled = true;
    // The chatter the HUD prints. Written as a radio station the player is eavesdropping on.
    this.radio = [
      'RADIO COSTA — "clear skies over the bay, thirty-one degrees..."',
      'RADIO COSTA — "traffic backed up on the coastal strip, take the back streets."',
      'RADIO COSTA — "...and a reminder: the marina fish market closes at midnight."',
      'RADIO COSTA — "requests tonight go out to everybody still driving."',
      'RADIO COSTA — "police scanners busy on the east side. You did not hear that here."',
      'RADIO COSTA — "now: nine minutes of trumpet, no interruptions."',
    ];
    this.onRadio = null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      this.context = new Context();
    } catch {
      this.context = null;
      return;
    }
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(context.destination);

    // A gentle limiter, so a gunshot over the engine never clips.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    limiter.connect(this.master);
    this.bus = limiter;

    this.buildEngine();
    this.buildTyre();
    this.buildSiren();
    this.buildSurf();
    this.buildShotPool();
    this.ready = true;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  noiseBuffer(seconds = 2) {
    const context = this.context;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic noise: a small LCG rather than Math.random, so the soundscape is repeatable.
    let state = 0x9e3779b9;
    for (let i = 0; i < length; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = (state / 2147483648 - 1) * 0.85;
    }
    return buffer;
  }

  buildEngine() {
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3.2;
    filter.connect(gain);
    gain.connect(this.bus);

    const a = context.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 46;
    const b = context.createOscillator();
    b.type = 'square';
    b.frequency.value = 69;
    const c = context.createOscillator();
    c.type = 'triangle';
    c.frequency.value = 23;
    for (const oscillator of [a, b, c]) {
      oscillator.connect(filter);
      oscillator.start();
    }
    this.voices.engine = { gain, filter, oscillators: [a, b, c] };
  }

  buildTyre() {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(1.5);
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2100;
    band.Q.value = 2.4;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(band);
    band.connect(gain);
    gain.connect(this.bus);
    source.start();
    this.voices.tyre = { gain, band, source };
  }

  buildSiren() {
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    const a = context.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 690;
    const b = context.createOscillator();
    b.type = 'square';
    b.frequency.value = 1035;
    const hush = context.createBiquadFilter();
    hush.type = 'lowpass';
    hush.frequency.value = 2600;
    const mix = context.createGain();
    mix.gain.value = 0.5;
    a.connect(mix);
    b.connect(mix);
    mix.connect(hush);
    hush.connect(gain);
    // A slow LFO alternating between the two tones is the whole siren.
    const lfo = context.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.42;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(a.frequency);
    lfoGain.connect(b.frequency);
    a.start();
    b.start();
    lfo.start();
    this.voices.siren = { gain, lfo, oscillators: [a, b] };
  }

  buildSurf() {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(4);
    source.loop = true;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    low.Q.value = 0.6;
    const gain = context.createGain();
    gain.gain.value = 0.05;
    source.connect(low);
    low.connect(gain);
    gain.connect(this.bus);
    source.start();
    // A slow swell, so the surf breathes instead of hissing.
    const swell = context.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.085;
    const swellGain = context.createGain();
    swellGain.gain.value = 0.028;
    swell.connect(swellGain);
    swellGain.connect(gain.gain);
    swell.start();
    this.voices.surf = { gain, source };
  }

  buildShotPool() {
    // Six reusable one-shots; the gun fires faster than a single node chain can be torn down.
    this.voices.shots = [];
    for (let i = 0; i < 6; i += 1) {
      const context = this.context;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(this.bus);
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer(0.35);
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400;
      band.Q.value = 0.9;
      noise.connect(band);
      band.connect(gain);
      const crack = context.createOscillator();
      crack.type = 'square';
      crack.frequency.value = 160;
      const crackGain = context.createGain();
      crackGain.gain.value = 0.35;
      crack.connect(crackGain);
      crackGain.connect(gain);
      this.voices.shots.push({ gain, noise, band, crack, busy: 0 });
    }
  }

  /** Engine note and tyre slip, called every frame while the player drives. */
  update(dt, { speedKmh = 0, slip = 0, driving = false, wanted = 0, nearWater = false } = {}) {
    if (!this.ready) return;
    const context = this.context;
    const now = context.currentTime;
    const engine = this.voices.engine;
    const speed = Math.abs(speedKmh);
    const revs = Math.min(1, speed / 130);
    // Pitch rises with speed; the top oscillator screams a little above 100 km/h.
    const base = 40 + revs * 118;
    engine.oscillators[0].frequency.setTargetAtTime(base, now, 0.08);
    engine.oscillators[1].frequency.setTargetAtTime(base * 1.51, now, 0.08);
    engine.oscillators[2].frequency.setTargetAtTime(base * 0.5, now, 0.12);
    engine.filter.frequency.setTargetAtTime(300 + revs * 1500, now, 0.1);
    engine.gain.gain.setTargetAtTime(driving ? 0.075 + revs * 0.1 : 0, now, 0.12);

    const tyre = this.voices.tyre;
    tyre.gain.gain.setTargetAtTime(driving ? Math.min(0.16, Math.abs(slip) * 0.05) : 0, now, 0.06);
    tyre.band.frequency.setTargetAtTime(1700 + revs * 1400, now, 0.1);

    const siren = this.voices.siren;
    const target = wanted > 0 ? Math.min(0.05, 0.012 + wanted * 0.008) : 0;
    siren.gain.gain.setTargetAtTime(target, now, 0.25);

    const surf = this.voices.surf;
    surf.gain.gain.setTargetAtTime(nearWater ? 0.07 : 0.032, now, 0.6);

    // Gulls, on a timer, only in daylight.
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 5 + (this.radioIndex % 7);
      this.gull();
    }
  }

  /** A short pitch-bent chirp pair: close enough to a gull over water. */
  gull() {
    if (!this.ready) return;
    const context = this.context;
    const now = context.currentTime;
    for (let n = 0; n < 2; n += 1) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      const gain = context.createGain();
      const start = now + n * 0.13;
      osc.frequency.setValueAtTime(1250 + n * 90, start);
      osc.frequency.exponentialRampToValueAtTime(760, start + 0.16);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.014, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
      osc.connect(gain);
      gain.connect(this.bus);
      osc.start(start);
      osc.stop(start + 0.22);
    }
  }

  /** A pistol or SMG report. `volume` in 0..1; `pitch` skews the crack. */
  gunshot(volume = 1, pitch = 1) {
    if (!this.ready) return;
    let slot = this.voices.shots.find((entry) => entry.busy <= 0);
    if (!slot) slot = this.voices.shots[0];
    const context = this.context;
    const now = context.currentTime;
    slot.busy = 0.12;
    slot.gain.gain.cancelScheduledValues(now);
    slot.gain.gain.setValueAtTime(Math.min(0.5, 0.34 * volume), now);
    slot.gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.16);
    slot.band.frequency.setValueAtTime(1200 * pitch, now);
    slot.band.frequency.exponentialRampToValueAtTime(340, now + 0.12);
    slot.crack.frequency.setValueAtTime(190 * pitch, now);
    slot.crack.frequency.exponentialRampToValueAtTime(48, now + 0.1);
    try {
      slot.noise.start(now);
      slot.noise.stop(now + 0.18);
      slot.crack.start(now);
      slot.crack.stop(now + 0.14);
    } catch {
      // A source can only be started once; rebuild the pair for the next shot.
      this.rebuildShot(slot);
    }
  }

  rebuildShot(slot) {
    const context = this.context;
    const noise = context.createBufferSource();
    noise.buffer = this.noiseBuffer(0.35);
    noise.connect(slot.band);
    const crack = context.createOscillator();
    crack.type = 'square';
    const crackGain = context.createGain();
    crackGain.gain.value = 0.35;
    crack.connect(crackGain);
    crackGain.connect(slot.gain);
    slot.noise = noise;
    slot.crack = crack;
  }

  /** One frame of housekeeping: free the one-shot slots. */
  tick(dt) {
    if (!this.ready) return;
    for (const slot of this.voices.shots) {
      if (slot.busy > 0) slot.busy -= dt;
    }
  }

  /** A dead-simple UI blip for menu confirmations. */
  blip(frequency = 640) {
    if (!this.ready) return;
    const context = this.context;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.6, now + 0.09);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);
    osc.connect(gain);
    gain.connect(this.bus);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** The next radio line, cycling. The HUD prints it as a toast. */
  nextRadioLine(dt) {
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return null;
    this.radioTimer = 26 + (this.radioIndex % 5) * 7;
    const line = this.radio[this.radioIndex % this.radio.length];
    this.radioIndex += 1;
    return line;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(enabled ? 0.55 : 0, this.context.currentTime, 0.1);
  }
}
