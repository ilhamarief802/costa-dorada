// Evaluate explicit camera candidates for a shot: where the hero lands on the frame, and whether
// the placement is inside the contact-sheet spec.
//
//   node tools/frame.mjs
//
// This is the arithmetic twin of tools/spec.mjs (which measures the real render and is the ground
// truth). The spec's bounds: camera 2.2-3.5 m above the ground, vertical field of view 26-55
// degrees, the hero subject in the lower third at 30-45 percent of the frame's width.
const W = 1280;
const H = 720;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** three.js Object3D.lookAt: the camera looks down -Z with +Y up. */
function basis(eye, target) {
  const z = norm(sub(eye, target));
  let x = cross([0, 1, 0], z);
  if (Math.hypot(...x) < 1e-6) x = [1, 0, 0];
  x = norm(x);
  return { x, y: cross(z, x), z };
}

function project(eye, target, fovDeg, point) {
  const { x, y, z } = basis(eye, target);
  const d = sub(point, eye);
  // `z` points from the target back toward the eye, so a point in front has dot(d, z) < 0.
  const cz = -dot(d, z);
  if (cz <= 0.1) return null;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * (W / H);
  return { sx: (dot(d, x) / (cz * tanH) + 1) / 2, sy: (1 - dot(d, y) / (cz * tanV)) / 2 };
}

function heroRect({ camera, target, fov, hero, yaw }) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const xs = [];
  const ys = [];
  for (const lx of [-1.05, 1.05]) {
    for (const lz of [-2.45, 2.45]) {
      for (const h of [0, 1.45]) {
        const p = [hero[0] + lx * c + lz * s, hero[1] + h, hero[2] - lx * s + lz * c];
        const v = project(camera, target, fov, p);
        if (!v) return null;
        xs.push(v.sx);
        ys.push(v.sy);
      }
    }
  }
  return {
    x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
  };
}

/**
 * A street camera: `back` metres behind the hero along `dir`, `lateral` metres across, `height`
 * up, aimed at a point `ahead` down the avenue and `drop` below the camera.
 */
function streetCamera(name, hero, yaw, { back, lateral, height, ahead, drop, fov, dir = [0, -1] }) {
  const span = [-dir[1], dir[0]];
  return {
    name,
    // `dir` is the way the camera looks, so `back` steps the eye the other way.
    camera: [hero[0] - dir[0] * back + span[0] * lateral, height, hero[2] - dir[1] * back + span[1] * lateral],
    target: [hero[0] + dir[0] * ahead, height - drop, hero[2] + dir[1] * ahead],
    fov,
    hero,
    yaw,
  };
}

function audit(candidate) {
  const rect = heroRect(candidate);
  if (!rect) return { rect: null, problems: ['hero off frame'] };
  const { camera, fov } = candidate;
  const problems = [];
  if (camera[1] < 2.2 || camera[1] > 3.5) problems.push(`height ${camera[1].toFixed(2)}`);
  if (fov < 26 || fov > 55) problems.push(`fov ${fov}`);
  if (rect.width < 0.30 || rect.width > 0.45) problems.push(`width ${rect.width.toFixed(2)}`);
  if (rect.y1 < 0.66) problems.push(`base ${rect.y1.toFixed(2)} too high`);
  if (rect.y1 > 0.99) problems.push(`base ${rect.y1.toFixed(2)} past frame`);
  if (rect.y0 < 0.38) problems.push(`top ${rect.y0.toFixed(2)} too high`);
  if (rect.x0 < 0.0 || rect.x1 > 1.0) problems.push(`x ${rect.x0.toFixed(2)}..${rect.x1.toFixed(2)}`);
  return { rect, problems };
}

function search(hero, yaw, dir = [0, -1]) {
  const passing = [];
  const misses = { off: 0 };
  for (const back of [7, 8, 9, 10, 11, 12, 14, 16]) {
    for (const lateral of [-3, -2.4, -1.8, -1.2, 1.2, 1.8, 2.4, 3]) {
      for (const height of [2.4, 2.6, 2.8, 3.0, 3.2]) {
        for (const ahead of [30, 40, 50, 60, 80]) {
          for (const drop of [0, 0.4, 0.8, 1.2]) {
            for (const fov of [28, 32, 36, 40, 44]) {
              const candidate = streetCamera('c', hero, yaw, { back, lateral, height, ahead, drop, fov, dir });
              const { rect, problems } = audit(candidate);
              if (!rect) { misses.off += 1; continue; }
              if (problems.length) { misses[problems[0].split(' ')[0]] = (misses[problems[0].split(' ')[0]] ?? 0) + 1; continue; }
              passing.push({ candidate, rect });
            }
          }
        }
      }
    }
  }
  passing.sort((a, b) => {
    const score = (p) => Math.abs(p.rect.width - 0.375) + Math.abs(p.rect.y1 - 0.88) + Math.abs((p.rect.x0 + p.rect.x1) / 2 - 0.3);
    return score(a) - score(b);
  });
  return { passing, misses };
}

const JOBS = [
  ['cover', [40.2, 0.16, 325.4], 0.14, [0, -1]],
  ['night', [47.5, 0.16, 322.0], 2.42, [0, -1]],
  ['chase', [45.2, 0.16, 296.4], 0.06, [0, -1]],
  ['mission', [240.5, 0.16, 344.0], 0.42, [0.66, 0.75]],
];

for (const [name, hero, yaw, dir] of JOBS) {
  const { passing, misses } = search(hero, yaw, dir);
  console.log(`\n=== ${name}: ${passing.length} valid placements  (misses ${JSON.stringify(misses)})`);
  for (const { candidate, rect } of passing.slice(0, 3)) {
    const { camera, target, fov } = candidate;
    console.log(`  camera [${camera.map((v) => v.toFixed(2)).join(', ')}] target [${target.map((v) => v.toFixed(2)).join(', ')}] fov ${fov}`);
    console.log(`  hero x ${rect.x0.toFixed(2)}..${rect.x1.toFixed(2)} (w ${rect.width.toFixed(2)}) y ${rect.y0.toFixed(2)}..${rect.y1.toFixed(2)}`);
  }
}
