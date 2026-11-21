// Fixed-step simulation with interpolated rendering. Physics always advances in 1/60 s slices,
// while frames can arrive at any rate; the render callback receives the leftover fraction.
export default class Loop {
  constructor(update, render, step = 1 / 60) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.accumulator = 0;
    this.last = 0;
    this.running = false;
    this.raf = 0;
    this.frameCount = 0;
    this.stepCount = 0;
    this.fps = 0;
    this.frameMs = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _tick(now) {
    if (!this.running) return;
    const delta = Math.min((now - this.last) / 1000, 0.12);
    this.last = now;
    this.frameMs = this.frameMs * 0.9 + delta * 1000 * 0.1;
    this.fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;
    this.accumulator += delta;
    let guard = 0;
    while (this.accumulator >= this.step && guard < 8) {
      this.update(this.step);
      this.accumulator -= this.step;
      this.stepCount += 1;
      guard += 1;
    }
    if (guard === 8) this.accumulator = 0;
    const alpha = this.accumulator / this.step;
    this.render(alpha, delta);
    this.frameCount += 1;
    this.raf = requestAnimationFrame(this._tick);
  }
}
