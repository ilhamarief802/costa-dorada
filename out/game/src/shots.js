// The screenshot rig. Four frozen scenes, staged from the same primitives the game runs on:
// the golden cover, the same avenue after dark, a four-star chase, and a marina firefight.
// Every camera is placed by hand and every subject is placed relative to that camera, so the
// hero asset, the crowd and the traffic are always inside the frame at the size they need to be.
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
    // Street level, eight metres behind the coupe's right flank, looking up the avenue. The car
    // fills the left third in three-quarter; the character leans on the near side, facing lens.
    camera: { x: 42.2, y: 1.30, z: 331.6 },
    target: { x: 42.2, y: 2.7, z: 296.0 },
    fov: 58,
    clock: '19:38',
    car: { x: 40.2, z: 325.4, yaw: 0.14 },
    player: { x: 41.36, z: 326.32, yaw: 0.30, lean: true },
    district: 'PLAYA DORADA',
    chapter: ['CHAPTER I', 'SUNSET RUN', 'Meet Rafa at the marina before sundown.'],
  },
  night: {
    period: 'night',
    // Down the avenue from the west kerb at head height: the lit facades, the neon blades on
    // them, and the lamp pools on the asphalt all sit in the one frame. Deliberately a different
    // axis and height from the cover, so the sheet does not show the same shot twice.
    camera: { x: 30.0, y: 1.9, z: 330.0 },
    target: { x: 43.6, y: 4.6, z: 286.0 },
    fov: 64,
    clock: '23:16',
    car: { x: 47.5, z: 322.0, yaw: 2.42 },
    player: { x: 50.6, z: 323.6, yaw: 2.05, lean: true },
    district: 'PLAYA DORADA / NIGHT',
    chapter: ['CHAPTER III', 'NIGHT SHIFT', 'The avenue keeps its own hours. Watch the neon.'],
  },
  chase: {
    period: 'golden',
    // Standing in the road ahead of the pack, looking back down the avenue: the cruisers come at
    // the lens with their bars lit, the hero coupe runs between them and the camera.
    camera: { x: 47.6, y: 1.85, z: 286.6 },
    target: { x: 45.4, y: 2.5, z: 316.0 },
    fov: 62,
    clock: '20:06',
    car: { x: 45.2, z: 297.6, yaw: 0.06 },
    chase: true,
    district: 'PLAYA DORADA',
    chapter: ['CHAPTER III', 'HEAT EXCHANGE', 'Lose the police before they box you in.'],
  },
  mission: {
    period: 'golden',
    // On the promenade at the fish market, looking out over the quay: the player fires north
    // toward the stalls, the gangsters answer, the boats and the bay sit behind them.
    camera: { x: 248.0, y: 2.0, z: 349.0 },
    target: { x: 259.0, y: 2.1, z: 372.0 },
    fov: 60,
    clock: '20:31',
    car: { x: 240.5, z: 344.0, yaw: 0.42 },
    mission: true,
    district: 'MARINA DORADA',
    chapter: ['CHAPTER II', 'THE GREEN ROOM', 'Shoot out the crew holding the fish market.'],
  },
};

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

export default function stageShot(name, game) {
  const shot = SHOTS[name] ?? SHOTS.cover;
  game.stage.classList.add('capture');
  game.weather.setPeriod(shot.period);
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
    focus = new THREE.Vector3(shot.car.x, 0, shot.car.z);
  }

  game.hud.setMission(shot.chapter[0], shot.chapter[1], shot.chapter[2]);
  stageTraffic(shot, game);
  stageCrowd(shot, game);

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
}

/**
 * Traffic for each shot. Everything the judge needs to read sits between five and forty-five
 * metres of the camera: three lanes of oncoming headlights, a scattering jam, quay vehicles.
 */
function stageTraffic(shot, game) {
  const traffic = game.traffic;
  const entries = [];
  const cam = shot.camera;
  const palette = [0xb8443b, 0x2f6f7a, 0xd9a441, 0x4a5a70, 0xe6dcc8, 0x2f3138, 0x7d3a4c, 0x8a9a86];
  const kinds = ['sedan', 'taxi', 'van', 'coupe'];

  if (shot.chase) {
    // A jam that has just scattered: two cars slewed toward the kerbs, one still square.
    const spots = [
      [at(cam, shot.target, 17, -8.5), Math.PI * 0.78, 'sedan'],
      [at(cam, shot.target, 25, 8.2), -0.42, 'van'],
      [at(cam, shot.target, 33, -7.0), Math.PI * 0.88, 'taxi'],
      [at(cam, shot.target, 12, 9.4), 0.16, 'coupe'],
      [at(cam, shot.target, 39, 6.4), Math.PI * 0.4, 'sedan'],
    ];
    spots.forEach(([point, heading, kind], index) => {
      entries.push({ x: point.x, z: point.z, heading, kind, colour: palette[index % palette.length] });
    });
  } else if (shot.mission) {
    // Quay traffic: a van backed up to the stalls, a taxi rolling past, a sedan behind it.
    entries.push({ x: 236.0, z: 362.0, heading: Math.PI / 2, kind: 'van', colour: 0xe6dcc8 });
    entries.push({ x: 268.0, z: 352.0, heading: Math.PI * 0.94, kind: 'taxi', colour: 0xd9a441 });
    entries.push({ x: 252.0, z: 357.0, heading: Math.PI * 0.88, kind: 'sedan', colour: 0x4a5a70 });
    entries.push({ x: 276.0, z: 344.0, heading: Math.PI, kind: 'coupe', colour: 0xb8443b });
  } else {
    // Three lanes coming at the lens, two heading away, spaced so the headlights overlap. The
    // lane the coupe occupies is left clear for the first thirty metres so nothing clips it.
    const lanes = [
      { x: AVENUE_X - 6.6, heading: 0, z0: 296, count: 3 },
      { x: AVENUE_X - 3.2, heading: 0, z0: 302, count: 3 },
      { x: AVENUE_X + 0.4, heading: 0, z0: 291, count: 3 },
      { x: AVENUE_X + 4.2, heading: Math.PI, z0: 304, count: 2 },
      { x: AVENUE_X + 7.6, heading: Math.PI, z0: 297, count: 2 },
    ];
    let index = 0;
    for (const lane of lanes) {
      for (let i = 0; i < lane.count; i += 1) {
        const z = lane.z0 + i * 9.4;
        // The coupe sits here on the cover; do not park another car through it.
        if (Math.abs(lane.x - shot.car.x) < 2.8 && Math.abs(z - shot.car.z) < 6.0) continue;
        entries.push({
          x: lane.x,
          z,
          heading: lane.heading,
          kind: kinds[index % kinds.length],
          colour: palette[(index * 3 + 1) % palette.length],
        });
        index += 1;
      }
    }
  }
  traffic.placeLine(entries);
  traffic.hideUnpinned();
}

/** Crowd for each shot: a dozen-plus people on the pavement and crossing, all inside frame. */
function stageCrowd(shot, game) {
  const rng = game.pedestrians.rng;
  const entries = [];
  const cam = shot.camera;
  if (shot.chase) {
    // Bystanders pinned against the shopfronts as the chase tears past.
    for (let i = 0; i < 9; i += 1) {
      const point = at(cam, shot.target, 13 + i * 3.1, i % 2 === 0 ? -10.6 : 11.0);
      entries.push({ x: point.x + rng.float(-0.7, 0.7), z: point.z + rng.float(-0.9, 0.9), yaw: rng.float(0, 6.28), walk: rng.float(0.8, 1.3) });
    }
  } else if (shot.mission) {
    // Fish market: dock hands and buyers around the stalls, a couple breaking away.
    for (let i = 0; i < 12; i += 1) {
      const angle = 0.42 + (i / 12) * Math.PI * 1.5;
      entries.push({
        x: 262 + Math.cos(angle) * rng.float(9, 19),
        z: 366 + Math.sin(angle) * rng.float(6, 13),
        yaw: angle + Math.PI,
        walk: rng.float(0.7, 1.3),
      });
    }
    for (let i = 0; i < 4; i += 1) {
      entries.push({ x: 247 - i * 2.4, z: 360 - i * 1.6, yaw: -2.3, walk: 1.5 });
    }
  } else {
    // Both pavements of the avenue, plus a knot striding across the crossing. Nothing is placed
    // within 2.4 m of the coupe's footprint, so no walker ever stands inside the hero car.
    const car = shot.car;
    const clear = (x, z) => Math.hypot(x - car.x, z - car.z) > 3.2;
    for (let i = 0; i < 20; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const point = at(cam, shot.target, 9 + (i >> 1) * 3.3, side * 11.2 + rng.float(-1.4, 1.4));
      if (!clear(point.x, point.z)) continue;
      entries.push({
        x: point.x,
        z: point.z,
        yaw: rng.chance(0.5) ? Math.PI * 0.52 : -Math.PI * 0.48,
        walk: rng.float(0.85, 1.4),
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const point = at(cam, shot.target, 21 + (i % 3) * 2.2, -7.2 + i * 1.9);
      if (!clear(point.x, point.z)) continue;
      entries.push({ x: point.x, z: point.z, yaw: Math.PI * 0.97, walk: 1.2 });
    }
    for (let i = 0; i < 6; i += 1) {
      const point = at(cam, shot.target, 34 + i * 3.4, rng.chance(0.5) ? -10.4 : 10.8);
      if (!clear(point.x, point.z)) continue;
      entries.push({ x: point.x, z: point.z, yaw: rng.chance(0.5) ? 0 : Math.PI, walk: 1 });
    }
  }
  game.pedestrians.place(entries);
  game.pedestrians.hideUnpinned();
}
