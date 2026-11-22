// The whole city as data. buildPlan(seed) is pure: it returns streets, blocks, towers, windows,
// palms, lamps, signage, colliders and the spawn, all derived from one RNG stream. Renderers
// below this layer only turn the data into meshes; gameplay only reads the same data back.
import Rng from '../core/rng.js';
import config from '../core/config.js';
import { clamp } from '../core/math.js';

const SIGN_TEXTS = ['HOTEL MIRAMAR', 'CLUB SOL', 'CAFE VERANO', 'RON PALMERA', 'FARO AZUL', 'CINE LUNA', 'BAR NEGRO', 'MERCADO 9', 'RADIO COSTA', 'HELADOS COSTA', 'TABACO', 'PENSION LUZ'];

/** Uniform-grid broadphase for building and prop boxes. */
class ColliderGrid {
  constructor(cell = 28) {
    this.cell = cell;
    this.buckets = new Map();
    this.items = [];
  }

  add(box) {
    const index = this.items.length;
    this.items.push(box);
    const cell = this.cell;
    const minX = Math.floor(box.minX / cell);
    const maxX = Math.floor(box.maxX / cell);
    const minZ = Math.floor(box.minZ / cell);
    const maxZ = Math.floor(box.maxZ / cell);
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const key = `${ix},${iz}`;
        if (!this.buckets.has(key)) this.buckets.set(key, []);
        this.buckets.get(key).push(index);
      }
    }
    return box;
  }

  query(x, z, radius, out = []) {
    out.length = 0;
    const cell = this.cell;
    const minX = Math.floor((x - radius) / cell);
    const maxX = Math.floor((x + radius) / cell);
    const minZ = Math.floor((z - radius) / cell);
    const maxZ = Math.floor((z + radius) / cell);
    const seen = new Set();
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const bucket = this.buckets.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const index of bucket) {
          if (seen.has(index)) continue;
          seen.add(index);
          out.push(this.items[index]);
        }
      }
    }
    return out;
  }
}

function blockCenter(index) {
  return (index - 3) * config.pitch;
}

function addBox(plan, box, kind = 'building') {
  const collider = {
    minX: box.x - box.w / 2,
    maxX: box.x + box.w / 2,
    minZ: box.z - box.d / 2,
    maxZ: box.z + box.d / 2,
    minY: 0.14,
    maxY: box.base + box.h,
    kind,
    step: Boolean(box.step),
  };
  plan.colliders.push(collider);
  plan.grid.add(collider);
  return collider;
}

function makeTiers(rng, building, style) {
  const { x, z, w, d, h, base, color } = building;
  const tiers = [];
  if (style === 'tower') {
    const podium = Math.min(h * 0.22, 15);
    tiers.push({ x, z, w: w + 5, d: d + 5, y: base, h: podium, color });
    const shaftH = h - podium - 9;
    tiers.push({ x, z, w, d, y: base + podium, h: shaftH, color });
    tiers.push({ x: x + rng.float(-1, 1), z: z + rng.float(-1, 1), w: w - 5, d: d - 5, y: base + podium + shaftH, h: 9, color });
  } else if (style === 'hotel') {
    tiers.push({ x, z, w, d, y: base, h: h * 0.34, color });
    tiers.push({ x, z, w: w - 2.5, d: d - 2.5, y: base + h * 0.34, h: h * 0.5, color });
    tiers.push({ x, z, w: w - 5, d: d - 5, y: base + h * 0.84, h: h * 0.16, color });
  } else {
    const first = Math.max(4.2, h * 0.42);
    tiers.push({ x, z, w, d, y: base, h: first, color });
    if (h > 7.5) {
      const second = h - first;
      tiers.push({ x, z, w: w - 1.7, d: d - 1.4, y: base + first, h: second, color });
      if (rng.chance(0.45)) {
        tiers.push({ x, z, w: Math.max(4, w - 5), d: Math.max(4, d - 4.5), y: base + h * 0.84, h: h * 0.16, color });
      }
    }
  }
  return tiers;
}

/** Windows for one tier, on the facades that face a street. */
function addTierWindows(plan, rng, building, tier, sides) {
  const spacing = building.style === 'tower' ? 4.0 : 3.25;
  const floor = building.style === 'tower' ? 3.8 : 3.3;
  const yStart = tier.y + (tier.y === building.base ? 4.1 : 2.1);
  for (let y = yStart; y < tier.y + tier.h - 1.2; y += floor) {
    const litRoll = rng.next();
    for (const side of sides) {
      let length = 0;
      let origin = { x: 0, z: 0 };
      let axis = 'x';
      let yaw = 0;
      if (side === 'n') {
        length = tier.w - 2.2;
        origin = { x: tier.x, z: tier.z - tier.d / 2 - 0.055 };
        axis = 'x';
        yaw = Math.PI;
      } else if (side === 's') {
        length = tier.w - 2.2;
        origin = { x: tier.x, z: tier.z + tier.d / 2 + 0.055 };
        axis = 'x';
        yaw = 0;
      } else if (side === 'e') {
        length = tier.d - 2.2;
        origin = { x: tier.x + tier.w / 2 + 0.055, z: tier.z };
        axis = 'z';
        yaw = Math.PI / 2;
      } else {
        length = tier.d - 2.2;
        origin = { x: tier.x - tier.w / 2 - 0.055, z: tier.z };
        axis = 'z';
        yaw = -Math.PI / 2;
      }
      if (length < 2.4) continue;
      const count = Math.max(1, Math.floor(length / spacing));
      const step = length / count;
      for (let i = 0; i < count; i += 1) {
        const offset = -length / 2 + step * (i + 0.5);
        plan.windows.push({
          x: origin.x + (axis === 'x' ? offset : 0),
          z: origin.z + (axis === 'z' ? offset : 0),
          y,
          yaw,
          w: building.style === 'tower' ? 1.55 : 1.28,
          h: building.style === 'tower' ? 2.05 : 1.7,
          lit: litRoll < 0.44,
          warm: Math.floor(rng.next() * 4),
        });
      }
    }
  }
}

function facadeSides(building, block) {
  const sides = [building.street];
  if (building.style === 'tower') return ['n', 's', 'e', 'w'];
  const edgeX = config.block / 2;
  const edgeZ = config.block / 2;
  const nearCorner =
    Math.abs(building.x - block.x) > edgeX - 18 && Math.abs(building.z - block.z) > edgeZ - 18;
  if (nearCorner) {
    if (building.street === 'n' || building.street === 's') {
      sides.push(building.x < block.x ? 'w' : 'e');
    } else {
      sides.push(building.z < block.z ? 'n' : 's');
    }
  }
  return sides;
}

function makeBuilding(plan, rng, options) {
  const building = {
    x: options.x,
    z: options.z,
    w: options.w,
    d: options.d,
    h: options.h,
    base: config.slabHeight,
    color: options.color,
    trim: options.trim,
    style: options.style,
    street: options.street,
    block: options.block,
    tiers: [],
  };
  building.tiers = makeTiers(rng, building, building.style);
  plan.buildings.push(building);
  const widest = building.tiers.reduce((acc, tier) => Math.max(acc, tier.w, tier.d), 0);
  addBox(
    plan,
    {
      x: building.x,
      z: building.z,
      w: Math.max(widest, building.w) + 0.1,
      d: Math.max(widest, building.d) + 0.1,
      h: building.h,
      base: building.base,
    },
    'building',
  );
  const sides = facadeSides(building, options.block);
  for (const tier of building.tiers) addTierWindows(plan, rng, building, tier, sides);
  if (building.style !== 'tower' && rng.chance(0.7)) {
    const units = rng.int(1, 3);
    for (let i = 0; i < units; i += 1) {
      plan.roofs.push({
        x: building.x + rng.float(-building.w * 0.3, building.w * 0.3),
        z: building.z + rng.float(-building.d * 0.3, building.d * 0.3),
        y: building.base + building.h,
        w: rng.float(1.3, 2.8),
        d: rng.float(1.3, 2.8),
        h: rng.float(0.55, 1.1),
        color: 0x8d8b84,
      });
    }
  }
  return building;
}

function generateLowrise(plan, rng, block) {
  const half = config.block / 2;
  const inset = config.sidewalk + 1.5;
  const color = rng.pick(config.palette.facades);
  const trim = rng.pick(config.palette.facadeTrim);
  const sides = ['n', 's', 'e', 'w'];
  for (const side of sides) {
    const count = rng.chance(0.55) ? 2 : 1;
    let widths;
    if (count === 1) {
      widths = [rng.float(30, 42)];
    } else {
      const gap = rng.float(1.5, 3.4);
      const first = rng.float(15, 21);
      const second = rng.float(15, 21);
      widths = [first, second, gap];
    }
    const span = count === 1 ? widths[0] : widths[0] + widths[2] + widths[1];
    let cursor = -span / 2;
    const slots = count === 1 ? [widths[0]] : [widths[0], widths[1]];
    for (const width of slots) {
      const depth = rng.float(12, 17);
      const along = cursor + width / 2;
      cursor += width + (count === 2 ? widths[2] : 0);
      const heightBase = block.bz === 6 ? rng.float(11, 26) : rng.float(7.5, 19);
      const height = Math.min(34, heightBase + (rng.chance(0.16) ? rng.float(8, 18) : 0));
      let x = block.x;
      let z = block.z;
      if (side === 'n') {
        x = block.x + along;
        z = block.z - half + inset + depth / 2;
      } else if (side === 's') {
        x = block.x + along;
        z = block.z + half - inset - depth / 2;
      } else if (side === 'e') {
        x = block.x + half - inset - depth / 2;
        z = block.z + along;
      } else {
        x = block.x - half + inset + depth / 2;
        z = block.z + along;
      }
      const footprintA = side === 'n' || side === 's' ? { w: width, d: depth } : { w: depth, d: width };
      makeBuilding(plan, rng, {
        x,
        z,
        w: footprintA.w,
        d: footprintA.d,
        h: height,
        color: rng.chance(0.25) ? rng.pick(config.palette.facades) : color,
        trim,
        style: height > 26 ? 'hotel' : 'lowrise',
        street: side,
        block,
      });
      if (height < 24 && rng.chance(0.32)) {
        plan.awnings.push({
          x: side === 'n' ? x : side === 's' ? x : side === 'e' ? block.x + half - inset + 0.1 : block.x - half + inset - 0.1,
          z: side === 'e' || side === 'w' ? z : side === 'n' ? block.z - half + inset - 0.1 : block.z + half - inset + 0.1,
          y: 3.35,
          yaw: side === 'n' ? Math.PI : side === 's' ? 0 : side === 'e' ? Math.PI / 2 : -Math.PI / 2,
          w: Math.min(6, width * 0.55),
          d: 2.3,
          color: rng.pick(config.palette.awnings),
        });
      }
    }
  }
}

function generateDowntown(plan, rng, block) {
  const offsets = [
    { x: -13, z: -13, w: 25, d: 25 },
    { x: 15, z: 15, w: 23, d: 23 },
    { x: 14, z: -14, w: 18, d: 18 },
  ];
  const count = rng.int(2, 3);
  for (let i = 0; i < count; i += 1) {
    const spot = offsets[i];
    const w = spot.w + rng.float(-2, 2);
    const d = spot.d + rng.float(-2, 2);
    const height = rng.float(42, 78) + (i === 0 ? 16 : 0);
    const style = 'tower';
    const building = makeBuilding(plan, rng, {
      x: block.x + spot.x,
      z: block.z + spot.z,
      w,
      d,
      h: height,
      color: rng.pick(config.palette.towerGlass),
      trim: 0xcfd8d6,
      style,
      street: 'e',
      block,
    });
    building.tower = true;
    if (rng.chance(0.7)) {
      plan.roofs.push({
        x: building.x,
        z: building.z,
        y: building.base + height,
        w: 3.4,
        d: 3.4,
        h: 2.2,
        color: 0x6f7c7f,
      });
    }
  }
}

function generateMarinaBlock(plan, rng, block) {
  const buildings = [
    { x: block.x - 18, z: block.z - 10, w: 24, d: 18, h: 8.5, color: 0xe4d6b8 },
    { x: block.x + 16, z: block.z - 18, w: 20, d: 16, h: 11, color: 0xc9785f },
    { x: block.x + 20, z: block.z + 16, w: 16, d: 14, h: 7, color: 0x8fb5b2 },
  ];
  for (const b of buildings) {
    makeBuilding(plan, rng, {
      x: b.x,
      z: b.z,
      w: b.w,
      d: b.d,
      h: b.h,
      color: b.color,
      trim: 0xf1e6cf,
      style: 'lowrise',
      street: 's',
      block,
    });
  }
}

function generatePark(plan, rng, block) {
  block.park = true;
  const palms = 14;
  for (let i = 0; i < palms; i += 1) {
    const angle = (i / palms) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const radius = rng.float(10, 29);
    plan.palms.push({
      x: block.x + Math.cos(angle) * radius,
      z: block.z + Math.sin(angle) * radius,
      scale: rng.float(0.85, 1.2),
      lean: rng.float(-0.08, 0.08),
      yaw: rng.float(0, Math.PI * 2),
      kind: 'park',
    });
  }
  plan.benches.push({ x: block.x, z: block.z + 8, yaw: Math.PI, y: config.slabHeight });
  plan.benches.push({ x: block.x - 8, z: block.z - 8, yaw: Math.PI / 2, y: config.slabHeight });
}

function generatePlaza(plan, rng, block) {
  block.plaza = true;
  plan.fountain = { x: block.x, z: block.z };
  const palms = 8;
  for (let i = 0; i < palms; i += 1) {
    const angle = (i / palms) * Math.PI * 2;
    plan.palms.push({
      x: block.x + Math.cos(angle) * 24,
      z: block.z + Math.sin(angle) * 24,
      scale: rng.float(0.9, 1.1),
      lean: 0,
      yaw: rng.float(0, Math.PI * 2),
      kind: 'plaza',
    });
  }
}

function populateStreetFurniture(plan, rng) {
  const nearRoad = (value) => plan.roads.z.some((road) => Math.abs(value - road) < 13);
  const nearRoadX = (value) => plan.roads.x.some((road) => Math.abs(value - road) < 13);
  for (let z = 312; z > -318; z -= 22) {
    if (nearRoad(z)) continue;
    for (const x of [34.6, 59.4]) {
      plan.palms.push({ x, z: z + rng.float(-1.2, 1.2), scale: rng.float(0.9, 1.18), lean: rng.float(-0.05, 0.05), yaw: rng.float(0, Math.PI * 2), kind: 'avenue' });
    }
  }
  for (let x = -315; x <= 315; x += 26) {
    plan.palms.push({ x: x + rng.float(-1, 1), z: 347.6, scale: rng.float(0.95, 1.25), lean: rng.float(-0.07, 0.07), yaw: rng.float(0, 6.28), kind: 'promenade' });
  }
  for (let x = -300; x <= 300; x += 31) {
    plan.palms.push({ x: x + rng.float(-2, 2), z: 364 + rng.float(-2, 2), scale: rng.float(0.8, 1.1), lean: rng.float(-0.1, 0.1), yaw: rng.float(0, 6.28), kind: 'beach' });
  }
  // Lamps: the avenue, the promenade and the cross streets.
  for (let z = 300; z > -318; z -= 36) {
    if (nearRoad(z)) continue;
    plan.lamps.push({ x: 36.3, z, yaw: 0, pool: true });
    if (!nearRoad(z - 18)) plan.lamps.push({ x: 57.7, z: z - 18, yaw: Math.PI, pool: true });
  }
  for (let x = -312; x <= 312; x += 44) {
    if (nearRoadX(x)) continue;
    if (Math.abs(x - 40) < 9) continue;
    plan.lamps.push({ x, z: 339.4, yaw: -Math.PI / 2, pool: true });
  }
  for (let z = 235; z > -300; z -= 94) {
    plan.lamps.push({ x: 320.2, z, yaw: Math.PI, pool: false });
  }
  // Parked cars along the avenue kerbs, clear of the junction mouths.
  const avenueZ = [300, 276, 252, 216, 192, 168, 128, 104, 66, 42, 8, -28, -70, -112, -176, -220];
  avenueZ.forEach((z, index) => {
    if (Math.abs(z - 300) > 14) {
      plan.parked.push({ x: 40.7, z, yaw: 0, color: rng.pick(config.palette.cars), tall: index % 4 === 0 });
    }
    if (Math.abs(z - 291) > 14) {
      plan.parked.push({ x: 53.3, z: z - 9, yaw: Math.PI, color: rng.pick(config.palette.cars), tall: index % 5 === 0 });
    }
  });
  const crossCars = [
    { x: -120, z: 235 + 6.9, yaw: Math.PI / 2 },
    { x: -60, z: 235 - 6.9, yaw: -Math.PI / 2 },
    { x: 160, z: 141 + 6.9, yaw: Math.PI / 2 },
    { x: 220, z: 141 - 6.9, yaw: -Math.PI / 2 },
    { x: -220, z: -47 + 6.9, yaw: Math.PI / 2 },
    { x: 120, z: -47 - 6.9, yaw: -Math.PI / 2 },
  ];
  for (const car of crossCars) plan.parked.push({ ...car, color: rng.pick(config.palette.cars), tall: rng.chance(0.3) });

  for (const car of plan.parked) {
    const alongX = Math.abs(Math.sin(car.yaw)) > 0.5;
    const collider = {
      minX: car.x - (alongX ? 2.25 : 1.02),
      maxX: car.x + (alongX ? 2.25 : 1.02),
      minZ: car.z - (alongX ? 1.02 : 2.25),
      maxZ: car.z + (alongX ? 1.02 : 2.25),
      minY: 0,
      maxY: 1.7,
      kind: 'prop',
      step: false,
    };
    plan.colliders.push(collider);
    plan.grid.add(collider);
  }

  for (let x = -300; x <= 300; x += 64) {
    plan.benches.push({ x, z: 348, yaw: Math.PI, y: config.slabHeight });
    plan.bins.push({ x: x + 9, z: 347.4, y: config.slabHeight });
    plan.hydrants.push({ x: x - 20, z: 345.6, y: config.slabHeight });
  }
  for (let z = 288; z > -288; z -= 78) {
    plan.bins.push({ x: 34.9, z, y: config.slabHeight });
    plan.hydrants.push({ x: 58.9, z: z - 30, y: config.slabHeight });
  }
  for (let z = 304; z > -300; z -= 34) {
    if (nearRoad(z)) continue;
    plan.planters.push({ x: 61.8, z, y: config.slabHeight });
    if (!nearRoad(z - 16)) plan.planters.push({ x: 32.2, z: z - 16, y: config.slabHeight });
  }
  plan.benches.push({ x: 61.9, z: 302.2, yaw: -Math.PI / 2, y: config.slabHeight });
  plan.bins.push({ x: 61.2, z: 296.8, y: config.slabHeight });
  plan.hydrants.push({ x: 59.2, z: 305.6, y: config.slabHeight });
  plan.planters.push({ x: 61.8, z: 311.2, y: config.slabHeight });
  plan.planters.push({ x: 61.8, z: 294.2, y: config.slabHeight });
  plan.benches.push({ x: 33.4, z: 297, yaw: Math.PI / 2, y: config.slabHeight });
  plan.benches.push({ x: 46, z: 341.2, yaw: 0, y: config.slabHeight });
  plan.planters.push({ x: 44.4, z: 340.8, y: config.slabHeight });
}

/** Signs are attached to facades that face the central avenue or the promenade. */
function chooseSigns(plan, rng) {
  const candidates = plan.buildings.filter((building) => {
    if (building.h < 9) return false;
    const block = building.block;
    const avenueFace = (block.bx === 3 && building.street === 'e') || (block.bx === 4 && building.street === 'w');
    const promenadeFace = block.bz === 6 && building.street === 's';
    return avenueFace || promenadeFace;
  });
  rng.shuffle(candidates);
  const count = Math.min(12, candidates.length);
  for (let i = 0; i < count; i += 1) {
    const building = candidates[i];
    const text = SIGN_TEXTS[i % SIGN_TEXTS.length];
    const vertical = i % 3 !== 2;
    let x = building.x;
    let z = building.z;
    let yaw = 0;
    if (building.street === 'e') {
      x = building.x + building.w / 2 + 0.16;
      yaw = Math.PI / 2;
    } else if (building.street === 'w') {
      x = building.x - building.w / 2 - 0.16;
      yaw = -Math.PI / 2;
    } else if (building.street === 's') {
      z = building.z + building.d / 2 + 0.16;
      yaw = 0;
    } else {
      z = building.z - building.d / 2 - 0.16;
      yaw = Math.PI;
    }
    const h = vertical ? Math.min(9.5, building.h * 0.52) : 2.6;
    const w = vertical ? 2.3 : Math.min(9, building.w * 0.6);
    plan.signs.push({
      x,
      z,
      y: config.slabHeight + Math.min(building.h * 0.62, 9.2),
      yaw,
      w,
      h,
      text,
      vertical,
      color: i % 4 === 0 ? 0xff8d74 : i % 4 === 1 ? 0xffd08a : i % 4 === 2 ? 0x9be4e0 : 0xe6a8ff,
    });
  }
}

export default function buildPlan(seed = config.seed) {
  const rng = new Rng(seed);
  const plan = {
    seed,
    rng,
    blocks: [],
    buildings: [],
    windows: [],
    roofs: [],
    awnings: [],
    signs: [],
    palms: [],
    lamps: [],
    parked: [],
    benches: [],
    bins: [],
    hydrants: [],
    planters: [],
    cafes: [],
    manholes: [],
    colliders: [],
    grid: new ColliderGrid(28),
    roads: { x: [], z: [], half: config.road / 2 },
    viaduct: null,
    fountain: null,
    marina: null,
    objective: null,
    spawn: { x: 47, z: 341.5, yaw: Math.PI },
    heroCar: { x: 28.0, z: 336.0, yaw: Math.PI / 2 },
    shotCamera: { x: 32.0, y: 2.0, z: 344.5, tx: 8, ty: 15, tz: -120 },
  };

  for (let i = 0; i < 8; i += 1) {
    const value = (i - 3.5) * config.pitch;
    plan.roads.x.push(value);
    plan.roads.z.push(value);
  }

  for (let bx = 0; bx < config.grid; bx += 1) {
    for (let bz = 0; bz < config.grid; bz += 1) {
      const block = {
        bx,
        bz,
        x: blockCenter(bx),
        z: blockCenter(bz),
        size: config.block,
        type: 'lowrise',
        park: false,
        plaza: false,
      };
      if (bx >= 2 && bx <= 4 && bz <= 2) {
        block.type = bx === 3 && bz === 1 ? 'landmark' : 'downtown';
      } else if (bx === 5 && bz === 3) {
        block.type = 'park';
      } else if (bx === 1 && bz === 4) {
        block.type = 'plaza';
      } else if (bx === 6 && bz === 6) {
        block.type = 'marina';
      } else if (bz === 6) {
        block.type = 'beachfront';
      } else if (bx === 6 && bz >= 4) {
        block.type = 'marina';
      }
      plan.blocks.push(block);
    }
  }

  for (const block of plan.blocks) {
    if (block.type === 'downtown') generateDowntown(plan, rng, block);
    else if (block.type === 'park') generatePark(plan, rng, block);
    else if (block.type === 'plaza') generatePlaza(plan, rng, block);
    else if (block.type === 'marina') generateMarinaBlock(plan, rng, block);
    else generateLowrise(plan, rng, block);
  }

  populateStreetFurniture(plan, rng);
  chooseSigns(plan, rng);

  const eastFront = plan.buildings.filter((building) => building.block.bx === 4 && building.block.bz === 6 && building.street === 'w');
  if (eastFront.length) {
    const host = eastFront[0];
    plan.signs.push({
      x: host.x - host.w / 2 - 0.16,
      z: host.z,
      y: host.base + Math.min(host.h * 0.56, 7.6),
      yaw: -Math.PI / 2,
      w: 2.5,
      h: Math.min(9, host.h * 0.55),
      text: 'HOTEL SOL',
      vertical: true,
      color: 0xff9a76,
    });
    plan.signs.push({
      x: host.x - host.w / 2 - 0.16,
      z: host.z + host.h * 0.12,
      y: host.base + 3.6,
      yaw: -Math.PI / 2,
      w: 7.2,
      h: 1.7,
      text: 'CAFE VERANO',
      vertical: false,
      color: 0xffd08a,
    });
    plan.awnings.push({
      x: host.x - host.w / 2,
      z: host.z,
      y: host.base + 3.3,
      yaw: -Math.PI / 2,
      w: 9.4,
      d: 2.4,
      color: 0x2f7d72,
    });
    plan.cafes.push({ x: 61.9, z: host.z - 1.4, y: config.slabHeight });
    plan.cafes.push({ x: 61.9, z: host.z - 4.6, y: config.slabHeight });
    plan.parked.push({ x: 58, z: 322.2, yaw: Math.PI, color: rng.pick(config.palette.cars), tall: false });
    plan.parked.push({ x: 20, z: 322.2, yaw: 0, color: rng.pick(config.palette.cars), tall: true });
    addBox(plan, { x: 58, z: 322.2, w: 2.1, d: 4.5, h: 1.7, base: 0.02 }, 'prop');
    addBox(plan, { x: 20, z: 322.2, w: 2.1, d: 4.5, h: 1.7, base: 0.02 }, 'prop');
    plan.manholes.push({ x: 51.6, z: 305.2 });
    plan.manholes.push({ x: 50.4, z: 298.6 });
    plan.manholes.push({ x: 60.3, z: 301.4 });
    plan.manholes.push({ x: 58.2, z: 294.6 });
    plan.manholes.push({ x: 46.2, z: 287.2 });
  }
  const westFront = plan.buildings.filter((building) => building.block.bx === 3 && building.block.bz === 6 && building.street === 'e');
  if (westFront.length) {
    const host = westFront[0];
    plan.signs.push({
      x: host.x + host.w / 2 + 0.16,
      z: host.z,
      y: host.base + Math.min(host.h * 0.5, 6.8),
      yaw: Math.PI / 2,
      w: 2.3,
      h: 7.4,
      text: 'CLUB SOL',
      vertical: true,
      color: 0x9be4e0,
    });
    plan.awnings.push({
      x: host.x + host.w / 2,
      z: host.z,
      y: host.base + 3.3,
      yaw: Math.PI / 2,
      w: 8.6,
      d: 2.2,
      color: 0xc4473a,
    });
  }

  // The landmark tower occupies the reserved central-north block.
  plan.landmarkTower = { x: blockCenter(3), z: blockCenter(1), height: 128, base: config.slabHeight };
  addBox(plan, { x: blockCenter(3), z: blockCenter(1), w: 19, d: 19, h: 128, base: config.slabHeight }, 'building');

  // Elevated freeway above the eastern ring boulevard.
  plan.viaduct = { axis: 'z', x: 329, z: 0, y: 9.4, width: 16, from: -430, to: 430, piers: [] };
  for (let z = -420; z <= 420; z += 40) {
    plan.viaduct.piers.push(z);
    addBox(plan, { x: 329, z, w: 7.2, d: 2.6, h: 9.4, base: 0.02 }, 'pillar');
  }

  // Marina piers and moored boats.
  plan.marina = {
    x: 270,
    z: 360,
    piers: [],
    boats: [],
    arch: { x: 270, z: 338.5, y: config.slabHeight },
  };
  [232, 270, 308].forEach((x, index) => {
    plan.marina.piers.push({ x, z: 380, w: 5.4, d: 84, y: 0.42 });
    for (let i = 0; i < 3; i += 1) {
      plan.marina.boats.push({
        x: x + (i % 2 === 0 ? -6.2 : 6.2),
        z: 398 + i * 8.4,
        yaw: Math.PI / 2 + (i % 2 === 0 ? 0 : Math.PI),
        color: rng.pick([0xf0e7d4, 0x3f6f7a, 0xc05a48, 0xd9b25c, 0x7a8f8a]),
        scale: rng.float(0.85, 1.25) + index * 0.03,
      });
    }
  });

  // The lighthouse marks the western point of the bay.
  plan.lighthouse = { x: -292, z: 366, height: 26 };

  // Promenade edge and beach stones, so the shore does not end in a hard line.
  plan.rocks = [];
  for (let i = 0; i < 34; i += 1) {
    plan.rocks.push({
      x: -330 + rng.float(0, 660),
      z: 386 + rng.float(-5, 8),
      scale: rng.float(0.5, 1.8),
      yaw: rng.float(0, Math.PI),
    });
  }

  plan.objective = { x: 270, z: 416, label: 'MARINA DORADA' };
  plan.spawn = { x: 47.4, z: 341.6, yaw: Math.PI };

  // Kerb stones are real, low colliders: feet step over them, wheels feel them.
  const curbHalf = config.block / 2;
  for (const block of plan.blocks) {
    const edges = [
      { x: block.x, z: block.z - curbHalf + 0.18, w: config.block, d: 0.36 },
      { x: block.x, z: block.z + curbHalf - 0.18, w: config.block, d: 0.36 },
      { x: block.x - curbHalf + 0.18, z: block.z, w: 0.36, d: config.block - 0.72 },
      { x: block.x + curbHalf - 0.18, z: block.z, w: 0.36, d: config.block - 0.72 },
    ];
    for (const edge of edges) {
      const collider = {
        minX: edge.x - edge.w / 2,
        maxX: edge.x + edge.w / 2,
        minZ: edge.z - edge.d / 2,
        maxZ: edge.z + edge.d / 2,
        minY: 0,
        maxY: config.curbHeight,
        kind: 'curb',
        step: true,
      };
      plan.colliders.push(collider);
      plan.grid.add(collider);
    }
  }

  // Ground query: block platforms sit a kerb above the asphalt, the beach falls to the sea.
  plan.heightAt = (x, z) => {
    if (plan.marina) {
      for (const pier of plan.marina.piers) {
        if (Math.abs(x - pier.x) <= pier.w / 2 && Math.abs(z - pier.z) <= pier.d / 2) return pier.y;
      }
    }
    if (z > config.beachStart) {
      if (z < 352) return config.slabHeight;
      const t = clamp((z - 352) / (config.beachEnd - 352), 0, 1);
      return config.slabHeight - t * t * 4.35;
    }
    if (x > -360 && x < 360 && z > -360) {
      const ix = Math.round(x / config.pitch) + 3;
      const iz = Math.round(z / config.pitch) + 3;
      if (ix >= 0 && ix < config.grid && iz >= 0 && iz < config.grid) {
        const cx = blockCenter(ix);
        const cz = blockCenter(iz);
        if (Math.abs(x - cx) <= config.block / 2 && Math.abs(z - cz) <= config.block / 2) {
          return config.slabHeight;
        }
      }
      return 0.02;
    }
    return 0;
  };

  plan.blockAt = (x, z) => {
    const ix = Math.round(x / config.pitch) + 3;
    const iz = Math.round(z / config.pitch) + 3;
    if (ix < 0 || ix >= config.grid || iz < 0 || iz >= config.grid) return null;
    const cx = blockCenter(ix);
    const cz = blockCenter(iz);
    if (Math.abs(x - cx) > config.block / 2 || Math.abs(z - cz) > config.block / 2) return null;
    return plan.blocks[iz * config.grid + ix];
  };

  plan.queryColliders = (x, z, radius, out) => plan.grid.query(x, z, radius, out);

  plan.trianglesEstimate = plan.windows.length * 2 + plan.buildings.length * 3 * 12 + plan.palms.length * 132;

  return plan;
}
