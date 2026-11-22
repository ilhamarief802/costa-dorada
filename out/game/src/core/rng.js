// A tiny deterministic generator. The whole city plan is a pure function of one uint32 seed,
// so ?seed=77 always yields the same streets, the same towers and the same palms.
export default class Rng {
  constructor(seed) {
    this.seed = seed >>> 0 || 0x9e3779b9;
    this.state = this.seed;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length) % items.length];
  }

  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const swap = items[i];
      items[i] = items[j];
      items[j] = swap;
    }
    return items;
  }
}
