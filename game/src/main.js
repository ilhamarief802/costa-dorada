// COSTA DORADA — bootstrap. Builds the renderer, the seeded city, the cast, the camera and the
// interface, then hands control to a fixed-step loop. Also owns the capture path: a shot URL
// freezes the sim, stages one frame and raises window.__SHOT_READY.
import config from './core/config.js';
import Input from './core/input.js';
import Loop from './core/loop.js';
import Events from './core/events.js';
import buildPlan from './world/plan.js';
import Terrain from './world/terrain.js';
import Water from './world/water.js';
import Roads from './world/roads.js';
import Blocks from './world/blocks.js';
import Buildings from './world/buildings.js';
import Palms from './world/palms.js';
import Props from './world/props.js';
import Landmarks from './world/landmarks.js';
import Sky from './world/sky.js';
import Weather from './world/weather.js';
import Player from './entities/player.js';
import Vehicle from './entities/vehicle.js';
import Traffic from './entities/traffic.js';
import Pedestrians from './entities/pedestrian.js';
import Police from './systems/police.js';
import Combat from './systems/combat.js';
import Missions from './systems/missions.js';
import Activities from './systems/activities.js';
import { saveGame, loadGame, hasSave } from './systems/save.js';
import CameraRig from './camera/rig.js';
import Hud from './ui/hud.js';
import Menus from './ui/menus.js';
import stageShot from './shots.js';
import { environmentTexture } from './core/assets.js';

const THREE = globalThis.THREE;

const canvas = document.getElementById('view');
const stageElement = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : config.seed;
const shotName = params.get('shot');
const capture = params.get('capture') === '1';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(1);
renderer.setSize(config.render.width, config.render.height, false);
if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
else renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = config.render.exposureGolden;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(config.render.fov, config.render.width / config.render.height, config.render.near, config.render.far);
camera.position.set(47, 3, 350);

const environmentSource = environmentTexture();
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentMap = pmrem.fromEquirectangular(environmentSource).texture;
scene.environment = environmentMap;
environmentSource.dispose();
pmrem.dispose();

const plan = buildPlan(seed);
const events = new Events();
const input = new Input(canvas);
const weatherSky = new Sky(plan, scene);

const terrain = new Terrain(plan);
const water = new Water(plan);
const roads = new Roads(plan);
const blocks = new Blocks(plan);
const buildings = new Buildings(plan);
const palms = new Palms(plan);
const props = new Props(plan);
const landmarks = new Landmarks(plan);
scene.add(weatherSky.group);
scene.add(terrain.group);
scene.add(water.group);
scene.add(roads.group);
scene.add(blocks.group);
scene.add(buildings.group);
scene.add(palms.group);
scene.add(props.group);
scene.add(landmarks.group);

const weather = new Weather({
  plan,
  sky: weatherSky,
  water,
  buildings,
  props,
  landmarks,
  renderer,
  scene,
});

const state = {
  mode: 'title',
  driving: false,
  time: 0,
  money: config.hud.money,
  health: config.hud.health,
  armour: config.hud.armour,
  wanted: 0,
  weaponKey: 'pistol',
  ammo: {
    pistol: { ammo: config.weapons.pistol.ammo, reserve: config.weapons.pistol.reserve },
    smg: { ammo: config.weapons.smg.ammo, reserve: config.weapons.smg.reserve },
  },
};

const player = new Player(plan);
const vehicle = new Vehicle(plan);
const traffic = new Traffic(plan);
const pedestrians = new Pedestrians(plan);
scene.add(player.group);
scene.add(vehicle.group);
scene.add(traffic.group);
scene.add(pedestrians.group);

const hud = new Hud(uiRoot, plan);
const menus = new Menus(uiRoot, {
  onContinue: () => startGame(true),
  onNewGame: () => startGame(false),
  onResume: () => resumeGame(),
  onRestart: () => restartGame(),
  onQuit: () => quitToTitle(),
});

const police = new Police({ plan, scene, player, vehicle, traffic, hud, events, state, seed });
const missions = new Missions({ plan, scene, player, vehicle, police, hud, events, state, seed });
const combat = new Combat({
  plan, scene, camera, player, vehicle, traffic, pedestrians, police, missions, hud, events, state, input,
});
const activities = new Activities({ plan, scene, player, vehicle, hud, events, state, seed });

const rig = new CameraRig(camera, plan, input);
rig.snap('foot', player, vehicle);

let audio = null;
let saveTimer = 12;

events.on('wanted', (level) => hud.setWanted(level));
events.on('crime', ({ reason }) => {
  if (reason === 'gunfire') hud.spawnMessage('SHOTS FIRED', '#ff9b70');
});
events.on('pursuit-lost', () => hud.spawnMessage('PURSUIT LOST', '#b9dcc0'));
events.on('gunshot', () => playGunshot());
events.on('police-shot', (shot) => {
  combat.spawnSparks(new THREE.Vector3(shot.x, shot.y, shot.z));
  playGunshot(0.5);
});
events.on('player-damaged', ({ amount }) => applyPlayerDamage(amount));
events.on('mission-failed', () => {
  state.mode = 'failed';
  saveState();
});
events.on('mission-complete', () => saveState());
events.on('mission-restarted', () => {
  state.mode = 'playing';
  state.health = 1;
  state.armour = Math.max(state.armour, 0.4);
  hud.setHealth(1);
  hud.setArmour(state.armour);
  police.setWanted(0);
  saveState();
});
events.on('activity-complete', () => {
  saveState();
});
events.on('stunt-jump', () => {
  hud.spawnMessage('STUNT JUMP  +$500', '#8fe3ee');
  saveState();
});

function ensureAudio() {
  if (audio) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) audio = new Context();
  } catch {
    audio = null;
  }
}

function playGunshot(volume = 1) {
  if (!audio) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(180, now);
  oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.09);
  gain.gain.setValueAtTime(0.05 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.13);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.14);
}

function syncHud() {
  hud.setMoney(state.money);
  hud.setHealth(state.health);
  hud.setArmour(state.armour);
  hud.setWanted(state.wanted);
  const spec = config.weapons[state.weaponKey];
  const ammo = state.ammo[state.weaponKey];
  hud.setWeapon(spec.name, ammo.ammo, ammo.reserve);
  hud.setClock(weather.clock);
}

function saveState() {
  if (state.mode !== 'playing' && state.mode !== 'failed') return;
  const progress = missions.progress();
  saveGame({
    cash: state.money,
    health: state.health,
    armour: state.armour,
    wanted: state.wanted,
    mission: progress,
    player: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
    vehicle: { x: vehicle.pos.x, z: vehicle.pos.z, yaw: vehicle.yaw },
    driving: state.driving,
    weaponKey: state.weaponKey,
    ammo: state.ammo,
    period: weather.period,
  });
}

function applyPlayerDamage(amount) {
  if (state.mode !== 'playing' || state.health <= 0) return;
  let remaining = Math.max(0, amount) / 100;
  if (state.armour > 0) {
    const absorb = Math.min(state.armour, remaining * 0.62);
    state.armour -= absorb;
    remaining -= absorb;
  }
  state.health = Math.max(0, state.health - remaining);
  hud.setHealth(state.health);
  hud.setArmour(state.armour);
  if (state.health <= 0) onPlayerDown();
}

function onPlayerDown() {
  police.setWanted(0);
  if (missions.active) {
    missions.fail('You were killed. The job is still waiting.');
    state.mode = 'failed';
    return;
  }
  state.health = 1;
  state.armour = Math.max(0.25, state.armour);
  state.driving = false;
  vehicle.release();
  player.stage(plan.spawn.x, plan.spawn.z, plan.spawn.yaw);
  player.setVisible(true);
  vehicle.stage(plan.heroCar.x, plan.heroCar.z, plan.heroCar.yaw);
  state.money = Math.max(0, state.money - 150);
  syncHud();
  rig.snap('foot', player, vehicle);
  hud.spawnMessage('WASTED  —  $150 HOSPITAL BILL', '#ff8a6a');
}

function startGame(continueSave) {
  ensureAudio();
  police.unlockAudio();
  menus.hideTitle();
  menus.hideControls();
  menus.hidePause();
  hud.setVisible(true);
  hud.hideFail();
  state.mode = 'playing';
  state.time = 0;
  state.driving = false;
  vehicle.release();
  vehicle.setVisible(true);
  player.reset();
  player.setVisible(true);
  vehicle.stage(plan.heroCar.x, plan.heroCar.z, plan.heroCar.yaw);
  police.setWanted(0, true);
  missions.reset();
  activities.end();
  weather.setPeriod('golden');
  traffic.setPeriod('golden');
  state.money = config.hud.money;
  state.health = config.hud.health;
  state.armour = config.hud.armour;
  state.weaponKey = 'pistol';
  state.ammo = {
    pistol: { ammo: config.weapons.pistol.ammo, reserve: config.weapons.pistol.reserve },
    smg: { ammo: config.weapons.smg.ammo, reserve: config.weapons.smg.reserve },
  };

  if (continueSave) {
    const data = loadGame();
    if (data) {
      state.money = data.cash ?? state.money;
      state.health = data.health ?? state.health;
      state.armour = data.armour ?? state.armour;
      state.weaponKey = config.weapons[data.weaponKey] ? data.weaponKey : 'pistol';
      if (data.ammo) state.ammo = data.ammo;
      if (data.period) {
        weather.setPeriod(data.period);
        traffic.setPeriod(data.period);
      }
      if (data.player) player.stage(data.player.x, data.player.z, data.player.yaw ?? 0);
      if (data.vehicle) vehicle.stage(data.vehicle.x, data.vehicle.z, data.vehicle.yaw ?? 0);
      if (data.mission) missions.restore(data.mission.index ?? 0, data.mission.stage ?? 0);
      police.setWanted(data.wanted ?? 0);
      if (data.driving) {
        state.driving = true;
        vehicle.occupy();
        vehicle.setPeriod(weather.period);
        player.setVisible(false);
      }
    } else {
      missions.activate(0, 0);
    }
  } else {
    missions.activate(0, 0);
  }

  combat.selectWeapon(state.weaponKey, true);
  syncHud();
  rig.snap(state.driving ? 'car' : 'foot', player, vehicle);
  input.requestLook();
  saveState();
  events.emit('started');
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  input.releaseLook();
  menus.showPause();
  saveState();
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  menus.hidePause();
  state.mode = 'playing';
  input.requestLook();
}

function restartGame() {
  state.driving = false;
  vehicle.release();
  player.reset();
  player.setVisible(true);
  vehicle.stage(plan.heroCar.x, plan.heroCar.z, plan.heroCar.yaw);
  police.setWanted(0);
  missions.reset();
  activities.end();
  weather.setPeriod('golden');
  traffic.setPeriod('golden');
  menus.hidePause();
  menus.hideTitle();
  hud.setVisible(true);
  hud.hideFail();
  state.health = 1;
  state.armour = 0.5;
  state.mode = 'playing';
  missions.activate(0, 0);
  syncHud();
  rig.snap('foot', player, vehicle);
  input.requestLook();
  saveState();
}

function quitToTitle() {
  saveState();
  state.mode = 'title';
  state.driving = false;
  vehicle.release();
  player.reset();
  player.setVisible(true);
  vehicle.stage(plan.heroCar.x, plan.heroCar.z, plan.heroCar.yaw);
  police.setWanted(0);
  activities.end();
  weather.setPeriod('golden');
  traffic.setPeriod('golden');
  menus.setSaveAvailable(hasSave());
  menus.showTitle();
  menus.hidePause();
  hud.setVisible(false);
  input.releaseLook();
  rig.snap('foot', player, vehicle);
}

function enterVehicle() {
  if (state.driving) return;
  state.driving = true;
  vehicle.occupy();
  vehicle.setPeriod(weather.period);
  player.setVisible(false);
  hud.clearPrompt();
  rig.orbitTimer = 0;
  events.emit('vehicle-entered');
}

function exitVehicle() {
  if (!state.driving) return;
  state.driving = false;
  vehicle.release();
  const exit = vehicle.exitPoint(new THREE.Vector3());
  player.pos.copy(exit);
  player.prev.copy(exit);
  player.vel.set(0, 0, 0);
  player.yaw = vehicle.yaw;
  player.prevYaw = vehicle.yaw;
  player.grounded = true;
  player.syncTransform();
  player.setVisible(true);
  events.emit('vehicle-exited');
}

function tryInteract() {
  if (state.driving) {
    exitVehicle();
    return;
  }
  if (vehicle.distanceToPlayer(player) < 3.6) enterVehicle();
}

function tryStealOrActivity() {
  if (state.driving) return;
  const activity = activities.prompt(player.pos);
  if (activity) {
    if (activities.start(activity.kind)) {
      hud.spawnMessage(activity.text, '#ffd77a');
      ensureAudio();
    }
    return;
  }
  const car = traffic.nearestStealable(player.pos.x, player.pos.z, 4.2);
  if (!car) return;
  const pose = traffic.steal(car);
  const witnesses = pedestrians.peds.some((ped) => !ped.dead && Math.hypot(ped.x - pose.x, ped.z - pose.z) < 15);
  const seenByPolice = police.cruisers.some((cruiser) => cruiser.alive && Math.hypot(cruiser.pos.x - pose.x, cruiser.pos.z - pose.z) < 38);
  // Some facades overhang the kerb; drop the coupe on the road centreline so stealing a car at
  // a tight junction never leaves the player wedged inside a wall collider.
  const nearest = (value, list) => list.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best), list[0]);
  const alongX = Math.abs(Math.sin(pose.yaw)) > Math.abs(Math.cos(pose.yaw));
  const sx = alongX ? pose.x : nearest(pose.x, plan.roads.x);
  const sz = alongX ? nearest(pose.z, plan.roads.z) : pose.z;
  vehicle.stage(sx, sz, pose.yaw);
  state.driving = true;
  vehicle.occupy();
  vehicle.setPeriod(weather.period);
  player.setVisible(false);
  rig.orbitTimer = 0;
  missions.notifySteal();
  hud.spawnMessage('VEHICLE STOLEN', '#ffd77a');
  if (witnesses || seenByPolice) police.addWanted(1, 'grand theft auto');
  saveState();
}

function update(dt) {
  state.time += dt;
  if (state.mode === 'paused') {
    if (input.consume('pause') || input.consume('confirm')) resumeGame();
    return;
  }
  if (state.mode === 'failed') {
    if (input.consume('reload')) missions.restart();
    else if (input.consume('pause')) pauseGame();
    return;
  }
  if (state.mode === 'title') {
    if (input.consume('confirm')) {
      startGame(false);
      return;
    }
    player.time += dt;
    player.animate(dt);
    vehicle.update(dt, input, false);
    traffic.update(dt, { playerPos: player.pos });
    pedestrians.update(dt);
    weather.update(dt, player.pos);
    return;
  }
  if (input.consume('pause')) {
    pauseGame();
    return;
  }
  if (input.consume('interact')) tryInteract();
  if (input.consume('steal')) tryStealOrActivity();

  if (state.driving) {
    vehicle.update(dt, input, true);
    if (vehicle.distanceToPlayer(player) > 80) {
      player.pos.copy(vehicle.pos);
      player.prev.copy(vehicle.pos);
    }
  } else {
    player.update(dt, input, rig.yaw);
    vehicle.update(dt, input, false);
  }

  traffic.update(dt, { playerPos: state.driving ? vehicle.pos : player.pos });
  pedestrians.update(dt);
  police.update(dt);
  missions.update(dt, {
    playerPos: state.driving ? vehicle.pos : player.pos,
    heading: state.driving ? vehicle.yaw : player.yaw,
  });
  activities.update(dt);
  combat.update(dt);
  weather.update(dt, state.driving ? vehicle.pos : player.pos);

  if (state.driving && Math.abs(vehicle.speedKmh) > 4) {
    const hit = pedestrians.strike(vehicle.pos.x, vehicle.pos.z, 2.1, Math.abs(vehicle.speedKmh));
    if (hit) {
      combat.spawnBlood(new THREE.Vector3(hit.x, 0.8, hit.z), 14);
      police.addWanted(2, 'hit-and-run');
      hud.spawnMessage('HIT AND RUN', '#ff8a6a');
    }
  }

  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 12;
    saveState();
  }
}

function currentPrompt() {
  if (state.mode !== 'playing') return null;
  if (state.driving) return { text: 'EXIT VEHICLE', key: 'E' };
  if (vehicle.distanceToPlayer(player) < 3.6) return { text: 'ENTER VEHICLE', key: 'E' };
  const activity = activities.prompt(player.pos);
  if (activity) return activity;
  if (traffic.nearestStealable(player.pos.x, player.pos.z, 4.0)) return { text: 'STEAL CAR', key: 'F' };
  return null;
}

function render(alpha, delta) {
  player.render(alpha);
  vehicle.render(alpha);
  rig.update(delta, state.driving ? 'car' : 'foot', player, vehicle);
  if (state.mode === 'playing' || state.mode === 'failed' || state.mode === 'paused') {
    hud.setClock(weather.clock);
    hud.setSpeed(vehicle.speedKmh, state.driving);
    const prompt = currentPrompt();
    if (prompt) hud.showPrompt(prompt.text, prompt.key);
    else hud.clearPrompt();
    hud.update(player, vehicle, state.driving, state.time, camera, {
      traffic: traffic.cars,
      cruisers: police.cruisers.filter((cruiser) => cruiser.alive).map((cruiser) => ({
        x: cruiser.pos.x,
        z: cruiser.pos.z,
        flip: Math.sin(police.elapsed * 9 + cruiser.flash) > 0,
      })),
    });
  }
  renderer.render(scene, camera);
}

const loop = new Loop(update, render, 1 / 60);

canvas.addEventListener('click', () => {
  if (state.mode === 'playing') input.requestLook();
});

const game = {
  plan,
  scene,
  camera,
  renderer,
  input,
  player,
  vehicle,
  traffic,
  pedestrians,
  police,
  missions,
  combat,
  activities,
  props,
  weather,
  sky: weatherSky,
  rig,
  hud,
  menus,
  state,
  loop,
  events,
  stage: stageElement,
};

window.__COSTA = {
  get mode() {
    return state.mode;
  },
  get driving() {
    return state.driving;
  },
  get stats() {
    return {
      fps: loop.fps,
      frameMs: loop.frameMs,
      frames: loop.frameCount,
      steps: loop.stepCount,
    };
  },
  get info() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      windows: plan.windows.length,
      buildings: plan.buildings.length,
      palms: plan.palms.length,
      traffic: traffic.cars.length,
      pedestrians: pedestrians.peds.length,
      wanted: state.wanted,
    };
  },
};
window.__COSTA_GAME = game;

if (shotName && capture) {
  input.setEnabled(false);
  menus.hideTitle();
  menus.hidePause();
  hud.setVisible(true);
  hud.setClock(shotName === 'night' ? '23:18' : '19:42');
  weather.setPeriod(shotName === 'night' ? 'night' : 'golden');
  stageShot(shotName, game);
} else {
  menus.setSeed(seed, 'golden');
  menus.setSaveAvailable(hasSave());
  menus.showTitle();
  hud.setVisible(false);
  hud.setClock(weather.clock);
  hud.setSpeed(0, false);
  hud.clearPrompt();
  loop.start();
}
