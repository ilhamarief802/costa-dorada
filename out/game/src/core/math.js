// Small scalar helpers used across simulation, camera and UI. Kept dependency free.

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function angleLerp(a, b, t) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

export function shortestAngle(a, b) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function rectContains(rect, x, z) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

export function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Push a circle out of an axis-aligned box; returns the resolved {x, z} or null if clear. */
export function resolveCircleBox(x, z, radius, box) {
  const closestX = clamp(x, box.minX, box.maxX);
  const closestZ = clamp(z, box.minZ, box.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq > radius * radius) return null;
  if (distanceSq > 1e-8) {
    const distance = Math.sqrt(distanceSq);
    const push = (radius - distance) / distance;
    return { x: x + dx * push, z: z + dz * push };
  }
  const left = x - box.minX;
  const right = box.maxX - x;
  const back = z - box.minZ;
  const front = box.maxZ - z;
  const smallest = Math.min(left, right, back, front);
  if (smallest === left) return { x: box.minX - radius, z };
  if (smallest === right) return { x: box.maxX + radius, z };
  if (smallest === back) return { x, z: box.minZ - radius };
  return { x, z: box.maxZ + radius };
}

/** Slab test. Returns entry distance along the ray, or Infinity when it misses. */
export function rayBox(origin, direction, box, maxDistance) {
  let tmin = 0;
  let tmax = maxDistance;
  for (const axis of ['x', 'y', 'z']) {
    const min = axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ;
    const max = axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ;
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return Infinity;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** Smooth pseudo-noise in 1D, deterministic and cheap; used for beach ripple and crowd gait. */
export function wave(x, frequency = 1, phase = 0) {
  return (
    Math.sin(x * frequency + phase) * 0.55 +
    Math.sin(x * frequency * 2.17 + phase * 1.7) * 0.3 +
    Math.sin(x * frequency * 0.53 + phase * 0.4) * 0.15
  );
}

export default {
  clamp,
  lerp,
  smoothstep,
  damp,
  dampAngle,
  angleLerp,
  shortestAngle,
  rectContains,
  rectsOverlap,
  resolveCircleBox,
  rayBox,
  wave,
};
