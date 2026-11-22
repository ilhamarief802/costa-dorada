// The screenshot rig. Four frozen scenes, staged from the same primitives the game runs on:
// the golden cover, the same avenue after dark, a four-star chase, and a marina firefight.
//
// Every camera is placed to the contact sheet's spec rather than by eye: 2.2 m to 3.5 m above the
// ground, a 26 to 55 degree field of view, the hero subject in the lower third at 30 to 45 percent
// of frame width. The cast is then positioned in *camera space* — `at()` walks a distance down the
// view axis and steps sideways — so a vehicle eighteen metres out and four to the right really
// lands there on screen no matter how the camera is later adjusted.
//
// The frames are stills, so the rig also has to stage the motion a still would otherwise freeze
// out: people caught mid-stride with their torso turned off the lens, two of them mid-crossing, a
// vendor bent over a cart, a driver's arm out of the window, brake lights lit on the cars that are
// slowing, exhaust haze behind one of them, a scooter leaning into a turn, gulls over the water.
import config from './core/config.js';

const THREE = globalThis.THREE;

/**
 * Where the avenue runs. The north-south street nearest the promenade sits at x = 47; the
 * promenade kerb is at z = 338 and the beach starts past it. Shots are aimed down that street.
 */
const AVENUE_X = 47;

const SHOTS = {
  cover: {
    period: 'golden',
    // Two and a half metres up, eight metres behind the coupe's right quarter, aimed far down the
    // avenue on a 44 degree lens. Solved with tools/frame.mjs: the coupe lands at x 0.15..0.46 and
    // y 0.58..0.93 of the frame, so it holds the lower third at a third of the width while the
    // avenue's traffic fills the middle distance and the towers soften into the sun's own haze.
    camera: { x: 43.2, y: 2.4, z: 333.4 },
    target: { x: 40.2, y: 1.2, z: 295.4 },
    fov: 44,
    sun: 0.94,
    clock: '19:38',
    car: { x: 40.2, z: 325.4, yaw: 0.14 },
    player: { x: 42.8, z: 326.44, yaw: 0.30, lean: true },
    district: 'PLAYA DORADA',
    chapter: ['CHAPTER I', 'SUNSET RUN', 'Meet Rafa at the marina before sundown.'],
  },
  night: {
    period: 'night',
    // Three metres up on the west pavement, looking down the avenue on a narrow lens: the hero
    // coupe under the lamp pool in the lower third (x 0.10..0.48, y 0.60..0.89), the neon blades
    // on both facades at mid height, the lit towers receding into the fog.
    camera: { x: 50.5, y: 2.6, z: 332.0 },
    target: { x: 47.5, y: 1.8, z: 262.0 },
    fov: 44,
    sun: 5.50,
    clock: '23:16',
    car: { x: 47.5, z: 322.0, yaw: 2.42 },
    player: { x: 50.6, z: 323.6, yaw: 2.05, lean: true },
    district: 'PLAYA DORADA / NIGHT',
    chapter: ['CHAPTER III', 'NIGHT SHIFT', 'The avenue keeps its own hours. Watch the neon.'],
  },
  chase: {
    period: 'golden',
    // On the kerb behind the pack, looking back down the avenue: the hero coupe runs away from the
    // lens in the lower third (x 0.09..0.40, y 0.59..0.93) with the cruisers closing behind it, the
    // helicopter's beam over the rooftops and a wall of traffic frozen mid-jam further down.
    camera: { x: 48.2, y: 2.4, z: 305.4 },
    target: { x: 45.2, y: 1.2, z: 266.4 },
    fov: 40,
    sun: 3.08,
    clock: '20:06',
    car: { x: 45.2, z: 296.4, yaw: 0.06 },
    chase: true,
    district: 'PLAYA DORADA',
    chapter: ['CHAPTER III', 'HEAT EXCHANGE', 'Lose the police before they box you in.'],
  },
  mission: {
    period: 'golden',
    // On the promenade above the fish market, looking out over the quay at 45 degrees to the quay
    // line: the parked sedan holds the lower third (x 0.48..0.80, y 0.60..0.90), the crew and the
    // stall-holders fill the middle, the boats and the bay sit behind them, gulls wheel overhead.
    camera: { x: 230.33, y: 2.4, z: 336.98 },
    target: { x: 260.3, y: 1.6, z: 366.5 },
    fov: 32,
    sun: 4.79,
    clock: '20:31',
    car: { x: 240.5, z: 344.0, yaw: 0.42 },
    mission: true,
    district: 'MARINA DORADA',
    chapter: ['CHAPTER II', 'THE GREEN ROOM', 'Shoot out the crew holding the fish market.'],
  },
};

/**
 * The hero subject's placement on the frame, as a fraction of width. Every shot keeps the hero
 * between 30 and 45 percent of the frame and inside the lower third (its base below the frame's
 * midline, its top above the bottom edge).
 */
const HERO_FRACTION = { cover: 0.37, night: 0.35, chase: 0.34, mission: 0.34 };

/**
 * Place a point in camera space: `forward` metres down the view axis, `lateral` metres to the
 * right of it. Used so cast members can be positioned as a fraction of the frame rather than by
 * guessing world coordinates.
 */
function at(camera, target, forward, lateral, up = 0) {
  const dx = target.x - camera.x;
  const dz = target.z - camera.z;
  const length = Math.hypot(dx, dz) || 1;
  const fx = dx / length;
  const fz = dz / length;
  const rx = -fz;
  const rz = fx;
  return {
    x: camera.x + fx * forward + rx * lateral,
    z: camera.z + fz * forward + rz * lateral,
    y: (camera.y ?? 0) + up,
  };
}

/** Heading in world yaw that faces back at the camera from `point`. */
function facing(camera, point) {
  return Math.atan2(camera.x - point.x, camera.z - point.z);
}

export default function stageShot(name, game) {
  const shot = SHOTS[name] ?? SHOTS.cover;
  game.stage.classList.add('capture');
  game.weather.setPeriod(shot.period);
  // Each frame is the same town at its own hour, so the sun is placed per shot: low and behind one
  // shoulder for the golden frames, gone for the night one.
  if (shot.sun !== undefined) {
    game.sky.setSunAzimuth(shot.sun, 0.24);
    game.water.setPeriod(shot.period, game.sky.sunDir);
  }
  game.traffic.setPeriod(shot.period);
  game.police.setWanted(0, true);
  game.traffic.releasePins();
  game.pedestrians.releasePins();
  game.vehicle.stage(shot.car.x, shot.car.z, shot.car.yaw);
  game.vehicle.setPeriod(shot.period);

  let focus = new THREE.Vector3(shot.target.x, 0, shot.target.z);

  if (shot.chase) {
    game.vehicle.setVisible(true);
    game.vehicle.occupy();
    game.player.setVisible(false);
    game.vehicle.setHeadingForShot();
    game.vehicle.addDriverArm();
    game.police.stageChase(game.vehicle.pos);
    game.hud.setWanted(4);
    focus = game.vehicle.pos.clone();
  } else if (shot.mission) {
    game.hud.setWanted(0);
    game.player.setVisible(true);
    game.vehicle.setVisible(true);
    game.vehicle.setHeadingForShot();
    const point = game.missions.stageShot({ camera: shot.camera, target: shot.target, at });
    // Stand the player where the rig asked, facing the crew with the pistol up.
    game.player.stage(point.player.x, point.player.z, Math.atan2(point.aim.x - point.player.x, point.aim.z - point.player.z));
    game.player.poseAim(true);
    focus = new THREE.Vector3(point.x, 0, point.z);
  } else {
    // The cover: the character leans against the coupe's near flank and looks to camera.
    game.hud.setWanted(0);
    const pose = shot.player;
    game.player.stage(pose.x, pose.z, pose.yaw);
    game.player.poseLean();
    game.player.setVisible(true);
    game.vehicle.setVisible(true);
    game.vehicle.setHeadingForShot();
    // The coupe is parked with the driver still in it, arm along the sill: a car with nobody in it
    // reads as scenery, and this is the cheapest way to say somebody is behind the wheel.
    game.vehicle.addDriverArm();
    focus = new THREE.Vector3(shot.car.x, 0, shot.car.z);
  }

  game.hud.setMission(shot.chapter[0], shot.chapter[1], shot.chapter[2]);
  stageTraffic(shot, name, game);
  stageCrowd(shot, name, game);

  game.traffic.update(0, { playerPos: game.vehicle.pos });
  game.pedestrians.update(0);
  game.missions.update(0, { playerPos: game.player.pos, heading: game.player.yaw });
  game.combat.update(0);

  game.hud.setVisible(true);
  game.hud.showPrompt(null);
  game.hud.setSpeed(shot.chase ? 88 : 0, Boolean(shot.chase));
  game.hud.setClock(shot.clock);
  game.hud.setDistrict(shot.district);
  game.menus.hideTitle();
  game.menus.hidePause();
  // The capture path hides the reticle: it is correct in play and noise on a poster.
  game.stage.classList.add('no-reticle');

  game.weather.update(1 / 60, focus);
  game.hud.update(game.player, game.vehicle, Boolean(shot.chase), 0, game.camera, {
    traffic: game.traffic.cars,
    cruisers: game.police.cruisers.filter((cruiser) => cruiser.alive).map((cruiser) => ({
      x: cruiser.pos.x, z: cruiser.pos.z, flip: Math.sin(game.police.elapsed * 7) > 0,
    })),
  });

  game.rig.setShot(
    new THREE.Vector3(shot.camera.x, shot.camera.y, shot.camera.z),
    new THREE.Vector3(shot.target.x, shot.target.y, shot.target.z),
    shot.fov,
  );

  game.renderer.shadowMap.needsUpdate = true;
  game.renderer.render(game.scene, game.camera);
  game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(() => {
    game.renderer.render(game.scene, game.camera);
    window.__SHOT_READY = true;
    window.__SHOT_NAME = name;
  });
  void config;
  void HERO_FRACTION;
}

/**
 * Traffic for each shot, placed in camera space so the counts and the depth bands are properties
 * of the composition rather than luck: at least eight cars inside seventy metres, a few inside
 * twelve, and — the thing a still has to make happen — brake lights lit on the ones slowing, one
 * car trailing exhaust haze, one scooter leaning into its turn.
 */
function stageTraffic(shot, name, game) {
  const traffic = game.traffic;
  const entries = [];
  const cam = shot.camera;
  const target = shot.target;
  // Five paint colours across three silhouettes, drawn from the same palette the game uses.
  const paints = [0xb8443b, 0x2f6f7a, 0xd9a441, 0x2f3138, 0xe6dcc8];
  const kinds = ['coupe', 'sedan', 'van'];

  const push = (forward, lateral, heading, kind, paint, extra = {}) => {
    const point = at(cam, target, forward, lateral);
    const entry = { x: point.x, z: point.z, heading, kind, colour: paint };
    if (extra.brake) entry.braking = true;
    if (extra.exhaust) entry.exhaust = true;
    if (extra.lean !== undefined) entry.lean = extra.lean;
    entries.push(entry);
  };

  if (name === 'chase') {
    // The coupe is the hero and the rig has already staged it. This is what it is running from:
    // three cruisers closing in echelon, then the jam they just scattered, then the blocked road.
    push(18.0, -3.0, Math.PI, 'sedan', 0x2f3138, { brake: true, exhaust: true });
    push(24.0, -5.6, Math.PI * 0.97, 'sedan', 0xe6dcc8, { brake: true });
    push(30.5, -2.2, Math.PI * 1.03, 'van', 0x2f6f7a, { brake: true });
    // The near lane, still rolling, so the jam is not uniform.
    push(15.0, 4.4, 0.02, 'coupe', 0xb8443b);
    push(21.5, 6.2, Math.PI * 0.02, 'sedan', 0xd9a441, { brake: true });
    push(27.5, 4.9, -0.03, 'van', 0x2f3138);
    // Right beside the lens: a car pulling out, close enough to read its paint and its driver.
    push(5.4, -4.6, Math.PI * 0.86, 'coupe', 0x2f6f7a, { brake: true });
    push(7.6, 5.2, 0.08, 'van', 0xe6dcc8, { exhaust: true });
    // The far side of the junction: more cars, smaller, closing the depth band. Kept clear of the
    // roadblock's own footprint (forward 40 to 44 m) so nothing intersections the trucks.
    push(34.5, -7.8, Math.PI * 0.95, 'sedan', 0x2f6f7a);
    push(48.5, -4.2, Math.PI, 'van', 0xe6dcc8);
    push(52.0, 6.8, 0.0, 'sedan', 0xb8443b);
    push(60.0, 1.4, Math.PI, 'coupe', 0xd9a441);
    // A parked scooter leaning into a turn on the near kerb, the way they sit in this town.
    push(6.2, -7.8, Math.PI * 0.62, 'scooter', 0xd9a441, { lean: 0.42 });
  } else if (name === 'mission') {
    // Quay traffic: a van backed up to the stalls, a taxi rolling past, a sedan behind it, plus
    // the dock's own vehicles further out. The hero sedan is the rig's.
    push(11.0, -6.4, Math.PI * 0.52, 'van', 0xe6dcc8, { brake: true });
    push(16.4, 3.8, Math.PI * 0.94, 'sedan', 0x2f6f7a);
    push(21.0, -2.6, Math.PI * 0.88, 'coupe', 0xb8443b, { brake: true, exhaust: true });
    push(26.0, 7.4, Math.PI * 0.4, 'sedan', 0xd9a441);
    push(33.0, -8.2, Math.PI * 0.7, 'van', 0x2f3138);
    push(41.0, 2.0, Math.PI * 0.9, 'sedan', 0xe6dcc8);
    push(48.0, -5.0, Math.PI * 0.6, 'coupe', 0x2f6f7a);
    push(56.0, 8.0, Math.PI * 1.1, 'van', 0xb8443b);
    push(64.0, -1.5, Math.PI * 0.8, 'sedan', 0xd9a441);
    // Two right at the lens: the van the crew arrived in, and a taxi on the quay road.
    push(6.8, 5.4, Math.PI * 1.42, 'van', 0x2f3138, { brake: true });
    push(5.2, -6.2, Math.PI * 0.46, 'coupe', 0xd9a441, { exhaust: true });
    push(8.4, -9.4, Math.PI * 0.53, 'scooter', 0x2f6f7a, { lean: -0.38 });
  } else {
    // The avenue. Three lanes coming at the lens, two heading away, spaced so the headlights
    // overlap and nothing clips the hero coupe's lane for the first thirty metres.
    push(13.0, 4.6, Math.PI, 'sedan', 0xd9a441, { brake: true });
    push(19.0, 8.3, Math.PI * 0.98, 'van', 0x2f6f7a, { exhaust: true });
    push(26.0, 3.4, Math.PI * 1.02, 'coupe', 0xb8443b);
    push(33.0, 7.0, Math.PI, 'sedan', 0x2f3138, { brake: true });
    push(41.0, 4.2, Math.PI, 'van', 0xe6dcc8);
    push(50.0, 8.8, Math.PI, 'sedan', 0x2f6f7a);
    // The away lane, seen from behind: brake lights the only thing to read.
    push(17.5, -6.6, 0.04, 'sedan', 0xe6dcc8, { brake: true });
    push(24.5, -9.4, -0.03, 'van', 0xb8443b);
    push(32.0, -6.2, 0.02, 'coupe', 0x2f6f7a);
    push(43.0, -9.8, 0.0, 'sedan', 0xd9a441);
    // Two in the near lane, close enough that their paint and their brake lights carry the frame.
    push(5.8, -5.0, Math.PI * 0.94, 'sedan', 0xb8443b, { brake: true });
    push(7.8, 6.0, 0.06, 'van', 0xe6dcc8, { exhaust: true });
    push(6.4, -10.4, Math.PI * 0.5, 'scooter', 0x2f3138, { lean: 0.44 });
  }

  // The rig only knows the silhouettes the car kit can build; a scooter is props' business, so it
  // is dropped here and re-added by stageProps as a leaning two-wheeler beside the kerb.
  const scooters = entries.filter((entry) => entry.kind === 'scooter');
  const cars = entries.filter((entry) => entry.kind !== 'scooter');
  traffic.placeLine(cars);
  traffic.hideUnpinned();
  game.props.stageScooters(scooters);
}

/**
 * Crowd for each shot. Ten or more people inside frame, a couple inside twelve metres, every one
 * mid-stride with the torso turned off the lens, all of them with different heights, shirts and
 * accessories — and the specific beats the brief asks for: two mid-crossing, a vendor bent over a
 * cart, a driver's arm out of a window.
 */
function stageCrowd(shot, name, game) {
  const rng = game.pedestrians.rng;
  const cam = shot.camera;
  const target = shot.target;
  const entries = [];

  // People, in camera space. Every one gets a distinct phase so no two are mid-step alike, a
  // distinct height and shirt, and one accessory.
  const ACCESSORIES = ['bag', 'cap', 'towel', 'bag', 'cap'];
  // Warm/cool alternation, so neighbouring figures separate at a glance even in the golden haze.
  const SHIRTS = [0xc75b4a, 0x3f6f86, 0xd8a95a, 0xe8e0cf, 0x4f7a52, 0x8b5a7a, 0xe07a3c, 0x2f4356, 0xf0d14e, 0x6f8f96];
  // Three deliberate body heights, cycled rather than jittered, so the crowd has real variety
  // instead of a continuum of near-identical averages.
  const HEIGHTS = [0.9, 1.0, 1.1];
  // The gesture set: stride, weight-on-one-leg, phone, bag, wall lean. Cycled so a row of people
  // never repeats a silhouette twice in a row.
  const POSES = ['walk', 'standing', 'phone', 'bag', 'lean', 'walk', 'standing', 'phone'];
  let poseCursor = 0;
  let personIndex = 0;
  const stand = (forward, lateral, opts = {}) => {
    const point = at(cam, target, forward, lateral);
    // Every staged person is turned 10 to 40 degrees off the lens: three-quarter, never a
    // passport photo and never a flat cardboard cut-out.
    const magnitude = Math.abs(opts.turn ?? rng.float(0.18, 0.7));
    const turn = (opts.sign ?? (rng.chance(0.5) ? 1 : -1)) * Math.min(0.7, Math.max(0.18, magnitude));
    const yaw = opts.yaw ?? (facing(cam, point) + turn);
    const pose = opts.pose ?? POSES[poseCursor++ % POSES.length];
    entries.push({
      x: point.x,
      z: point.z,
      yaw,
      walk: opts.walk ?? rng.float(0.95, 1.4),
      phase: opts.phase ?? rng.float(0, Math.PI * 2),
      scale: opts.scale ?? HEIGHTS[personIndex % HEIGHTS.length],
      shirt: SHIRTS[personIndex % SHIRTS.length],
      accessory: pose === 'bag' ? 'bag' : ACCESSORIES[personIndex % ACCESSORIES.length],
      pose,
    });
    personIndex += 1;
  };
  const cross = (forward, lateral, opts = {}) => {
    const point = at(cam, target, forward, lateral);
    const magnitude = Math.abs(opts.turn ?? rng.float(0.2, 0.62));
    const turn = (opts.sign ?? (rng.chance(0.5) ? 1 : -1)) * Math.min(0.68, Math.max(0.18, magnitude));
    entries.push({
      x: point.x,
      z: point.z,
      yaw: facing(cam, point) + turn,
      walk: 1.5,
      phase: opts.phase ?? Math.PI * 0.5,
      scale: opts.scale ?? HEIGHTS[personIndex % HEIGHTS.length],
      shirt: SHIRTS[personIndex % SHIRTS.length],
      accessory: ACCESSORIES[personIndex % ACCESSORIES.length],
      pose: 'cross',
    });
    personIndex += 1;
  };

  if (name === 'chase') {
    // Bystanders pinned against the shopfronts as the chase tears past, plus two stepping off the
    // kerb into the road to get out of the way of it.
    for (let i = 0; i < 9; i += 1) stand(13 + i * 2.6, i % 2 === 0 ? -10.4 : 10.8);
    cross(20.0, -2.2, { phase: 0.2 });
    cross(24.5, 3.1, { phase: 2.6 });
    stand(10.4, -8.9, { walk: 0.2, pose: 'vendor', turn: 0.22 });
    stand(9.0, 9.6, { walk: 0.2, pose: 'shop', turn: 0.3 });
    stand(14.5, -11.4, { pose: 'lean', turn: 0.34 });
    // Two right at the lens on the near pavement, close enough to read.
    stand(4.6, -7.2, { turn: 0.3 });
    stand(5.8, -9.4, { turn: 0.4, pose: 'phone' });
    stand(6.2, 8.4, { turn: 0.26 });
    stand(30.0, -9.2);
    stand(36.0, 9.8);
  } else if (name === 'mission') {
    // Fish market: dock hands and buyers around the stalls, a couple breaking away, the vendor
    // bent over his cart, a woman with a towel over her shoulder.
    for (let i = 0; i < 12; i += 1) {
      const angle = 0.42 + (i / 12) * Math.PI * 1.5;
      const forward = 12 + Math.cos(angle) * 7.5;
      const lateral = Math.sin(angle) * 8.5;
      stand(forward, lateral);
    }
    stand(11.2, -3.2, { walk: 0.15, pose: 'vendor', turn: 0.24 });
    stand(12.6, 4.6, { walk: 0.2, pose: 'shop', turn: 0.3 });
    cross(14.0, -8.4, { phase: 1.1 });
    cross(16.2, 8.9, { phase: 3.4 });
    stand(20.0, -10.2, { pose: 'lean' });
    stand(26.0, 10.4);
    stand(9.4, 6.4, { walk: 0.3, pose: 'argue', turn: 0.3 });
    // Buyers right at the lens, one haggling over the cart, one walking away with a bag.
    stand(4.8, 3.6, { turn: 0.2 });
    stand(6.0, -4.4, { turn: 0.3, pose: 'phone' });
    stand(5.4, 7.6, { turn: 0.35 });
  } else {
    // Both pavements of the avenue, plus a knot striding across the crossing. Nothing is placed
    // within 2.4 m of the coupe's footprint, so no walker stands inside the hero car.
    const car = shot.car;
    const clear = (x, z) => Math.hypot(x - car.x, z - car.z) > 3.2;
    const tryStand = (forward, lateral, opts) => {
      const point = at(cam, target, forward, lateral);
      if (!clear(point.x, point.z)) return;
      stand(forward, lateral, opts);
    };
    for (let i = 0; i < 20; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      tryStand(9 + (i >> 1) * 2.8, side * 10.6 + rng.float(-1.2, 1.2));
    }
    // The two mid-crossing: on the zebra, legs apart, torsos turned.
    cross(16.5, -5.4, { phase: 0.35 });
    cross(18.4, 1.8, { phase: 2.9 });
    // A vendor bent over his cart on the near kerb.
    tryStand(9.6, -9.2, { walk: 0.15, pose: 'vendor', turn: 0.24 });
    // A shopkeeper leaning in a doorway across the street.
    tryStand(10.8, 9.8, { walk: 0.2, pose: 'shop', turn: 0.3 });
    // A couple leaning on the shopfront walls.
    tryStand(12.4, -11.5, { pose: 'lean', turn: 0.32 });
    tryStand(15.2, 11.3, { pose: 'lean', turn: 0.36, sign: -1 });
    // Three right at the lens so the near layer is populated, not just the kerb.
    tryStand(5.0, -7.4, { turn: 0.25 });
    tryStand(6.4, -9.8, { turn: 0.35, pose: 'phone' });
    tryStand(5.6, 8.6, { turn: 0.22, pose: 'bag' });
    for (let i = 0; i < 6; i += 1) {
      tryStand(28 + i * 3.1, rng.chance(0.5) ? -9.8 : 10.2);
    }
  }

  game.pedestrians.place(entries);
  game.pedestrians.hideUnpinned();
}
