// The screenshot rig. Four frozen scenes: the golden cover, the same avenue at night, a police
// chase, and a mission firefight. The camera is placed by hand, the sim is advanced to a settled
// pose, one frame is rendered twice and the probe is told the frame is ready.
import config from './core/config.js';

const THREE = globalThis.THREE;

const SHOTS = {
  cover: {
    period: 'golden',
    camera: { x: 30.0, y: 2.6, z: 345.0 },
    target: { x: 8, y: 7.5, z: 40 },
    clock: '19:42',
    player: { x: 47.5, z: 341.6, yaw: Math.PI },
    car: { x: 28.0, z: 336.0, yaw: Math.PI / 2 },
    crowd: true,
    traffic: true,
  },
  night: {
    period: 'night',
    camera: { x: 30.0, y: 2.6, z: 345.0 },
    target: { x: 8, y: 7.5, z: 40 },
    clock: '23:18',
    player: { x: 47.5, z: 341.6, yaw: Math.PI },
    car: { x: 28.0, z: 336.0, yaw: Math.PI / 2 },
    crowd: true,
    traffic: true,
  },
  chase: {
    period: 'golden',
    camera: { x: -18, y: 4.4, z: 333 },
    target: { x: 30, y: 2.0, z: 327 },
    clock: '20:06',
    player: { x: 26, z: 326, yaw: Math.PI / 2 },
    car: { x: 26, z: 326, yaw: Math.PI / 2 },
    chase: true,
    traffic: false,
  },
  mission: {
    period: 'golden',
    camera: { x: -216, y: 5.0, z: 78 },
    target: { x: -188, y: 1.6, z: 94 },
    clock: '20:31',
    player: { x: -209, z: 88, yaw: Math.PI / 2 },
    car: { x: -204, z: 82, yaw: 0.4 },
    mission: true,
    traffic: false,
  },
};

export default function stageShot(name, game) {
  const shot = SHOTS[name] ?? SHOTS.cover;
  game.stage.classList.add('capture');
  game.weather.setPeriod(shot.period);
  game.traffic.setPeriod(shot.period);
  game.player.stage(shot.player.x, shot.player.z, shot.player.yaw);
  game.vehicle.stage(shot.car.x, shot.car.z, shot.car.yaw);
  game.vehicle.setPeriod(shot.period);
  game.police.setWanted(0, true);

  let focus = new THREE.Vector3(shot.target.x, 0, shot.target.z);

  if (shot.chase) {
    game.vehicle.setVisible(true);
    game.vehicle.occupy();
    game.player.setVisible(false);
    game.vehicle.update(1 / 60, game.input, false);
    game.police.stageChase(game.vehicle.pos);
    game.hud.setWanted(4);
    game.hud.setMission('CHAPTER III', 'HEAT EXCHANGE', 'Lose the police before they box you in.');
    focus = game.vehicle.pos.clone();
  } else if (shot.mission) {
    game.player.setVisible(true);
    game.vehicle.setVisible(true);
    const point = game.missions.stageShot();
    game.hud.setWanted(0);
    focus = new THREE.Vector3(point.x, 0, point.z);
  } else {
    game.player.setVisible(false);
    game.vehicle.setVisible(true);
    game.hud.setWanted(0);
    game.hud.setMission('CHAPTER I', 'SUNSET RUN', 'Meet Rafa at the marina before sundown.');
  }

  if (shot.crowd) game.pedestrians.stageCover();
  if (shot.traffic) game.traffic.stageCover();

  game.traffic.update(0, { playerPos: game.vehicle.pos });
  game.pedestrians.update(0);
  game.missions.update(0, { playerPos: game.player.pos, heading: game.player.yaw });
  game.combat.update(0);

  game.hud.setVisible(true);
  game.hud.showPrompt(null);
  game.hud.setSpeed(shot.chase ? 88 : 0, Boolean(shot.chase));
  game.hud.setClock(shot.clock);
  game.hud.setDistrict(shot.period === 'night' ? 'PLAYA DORADA / NIGHT' : 'PLAYA DORADA');
  game.menus.hideTitle();
  game.menus.hidePause();

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
