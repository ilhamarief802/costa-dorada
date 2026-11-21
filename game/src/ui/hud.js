// The in-game heads-up display. Everything is layered DOM over the canvas so type stays crisp:
// mission card, money, health and armour, weapon slot, wanted stars, clock, circular minimap,
// the waypoint arrow, activity banner, floating damage numbers and the mission-fail card.
import config from '../core/config.js';
import Minimap from './minimap.js';

const THREE = globalThis.THREE;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export default class Hud {
  constructor(root, plan) {
    this.root = element('div', 'hud');
    this.root.setAttribute('aria-hidden', 'true');
    root.appendChild(this.root);
    this.plan = plan;

    const mission = element('section', 'mission-card');
    this.kicker = element('div', 'mission-kicker', config.hud.chapter);
    this.title = element('h1', 'mission-title', config.hud.mission);
    this.objective = element('p', 'mission-objective', config.hud.objective);
    this.timer = element('div', 'mission-timer', '');
    mission.append(this.kicker, this.title, this.objective, this.timer);
    const rule = element('div', 'mission-rule');
    mission.appendChild(rule);
    this.root.appendChild(mission);

    const topRight = element('div', 'top-right');
    this.wanted = element('div', 'wanted-stars');
    for (let i = 0; i < 5; i += 1) this.wanted.appendChild(element('span', 'wanted-star', '★'));
    const mapWrap = element('div', 'minimap-wrap');
    this.minimap = new Minimap(mapWrap, plan);
    const ring = element('div', 'minimap-ring');
    mapWrap.appendChild(ring);
    const clockBlock = element('div', 'clock-block');
    this.clock = element('div', 'clock-time', config.clock.startGolden);
    this.district = element('div', 'clock-district', config.hud.district);
    clockBlock.append(this.clock, this.district);
    topRight.append(this.wanted, mapWrap, clockBlock);
    this.root.appendChild(topRight);

    const bottomLeft = element('div', 'bottom-left');
    this.money = element('div', 'money', `$${config.hud.money.toLocaleString('en-US')}`);
    const bars = element('div', 'bars');
    this.healthBar = element('div', 'bar health');
    this.healthFill = element('div', 'bar-fill');
    this.healthBar.appendChild(this.healthFill);
    this.armourBar = element('div', 'bar armour');
    this.armourFill = element('div', 'bar-fill');
    this.armourBar.appendChild(this.armourFill);
    const labels = element('div', 'bar-labels');
    labels.append(element('span', '', 'HEALTH'), element('span', '', 'ARMOUR'));
    bars.append(this.healthBar, this.armourBar, labels);
    bottomLeft.append(this.money, bars);
    this.root.appendChild(bottomLeft);

    const bottomRight = element('div', 'bottom-right');
    this.weapon = element('div', 'weapon-slot');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 64 40');
    icon.setAttribute('class', 'weapon-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 15h24l5-7h23v6H38l-2 5h-7l-2 15h-8l1-15H6z');
    icon.appendChild(path);
    const weaponText = element('div', 'weapon-text');
    this.weaponName = element('div', 'weapon-name', config.hud.weapon);
    this.weaponAmmo = element('div', 'weapon-ammo', `${config.hud.ammo} / ${config.hud.reserve}`);
    weaponText.append(this.weaponName, this.weaponAmmo);
    this.weapon.append(icon, weaponText);
    bottomRight.appendChild(this.weapon);
    this.root.appendChild(bottomRight);

    this.speed = element('div', 'speed');
    this.speedValue = element('span', 'speed-value', '0');
    this.speed.append(this.speedValue, element('span', 'speed-unit', 'KM/H'));
    this.root.appendChild(this.speed);

    this.crosshair = element('div', 'crosshair');
    this.crosshair.append(element('span', 'crosshair-h'), element('span', 'crosshair-v'));
    this.root.appendChild(this.crosshair);

    this.waypoint = element('div', 'waypoint-arrow');
    this.waypointArrow = element('span', 'waypoint-arrow-glyph', '▲');
    this.waypoint.append(this.waypointArrow, element('span', 'waypoint-distance', ''));
    this.waypointDistance = this.waypoint.querySelector('.waypoint-distance');
    this.waypoint.classList.add('hidden');
    this.root.appendChild(this.waypoint);

    this.activity = element('div', 'activity-card hidden');
    this.activityTitle = element('div', 'activity-title', '');
    this.activityObjective = element('div', 'activity-objective', '');
    this.activityTimer = element('div', 'activity-timer', '');
    this.activity.append(this.activityTitle, this.activityObjective, this.activityTimer);
    this.root.appendChild(this.activity);

    this.prompt = element('div', 'prompt');
    this.root.appendChild(this.prompt);

    this.messages = element('div', 'messages');
    this.root.appendChild(this.messages);

    this.damageLayer = element('div', 'damage-layer');
    this.root.appendChild(this.damageLayer);
    this.damageNumbers = [];

    this.fail = element('div', 'fail-card hidden');
    const failContent = element('div', 'fail-content');
    this.failTitle = element('div', 'fail-title', 'MISSION FAILED');
    this.failText = element('div', 'fail-text', '');
    failContent.append(this.failTitle, this.failText, element('div', 'fail-hint', 'PRESS R TO RESTART'));
    this.fail.appendChild(failContent);
    this.root.appendChild(this.fail);

    this.project = new THREE.Vector3();
    this.setHealth(config.hud.health);
    this.setArmour(config.hud.armour);
    this.setWanted(0);
    this.setWeapon(config.hud.weapon, config.hud.ammo, config.hud.reserve);
  }

  setHealth(value) {
    this.healthFill.style.width = `${Math.round(value * 100)}%`;
    this.healthBar.classList.toggle('low', value < 0.28);
  }

  setArmour(value) {
    this.armourFill.style.width = `${Math.round(value * 100)}%`;
  }

  setMoney(value) {
    this.money.textContent = `$${Math.round(value).toLocaleString('en-US')}`;
  }

  setClock(text) {
    this.clock.textContent = text;
  }

  setDistrict(text) {
    this.district.textContent = text;
  }

  setSpeed(kmh, driving) {
    this.speed.classList.toggle('visible', Boolean(driving));
    this.speedValue.textContent = String(Math.max(0, Math.round(kmh)));
  }

  setWanted(level) {
    const stars = Math.max(0, Math.min(5, level | 0));
    this.wanted.classList.toggle('visible', stars > 0);
    const children = this.wanted.children;
    for (let i = 0; i < children.length; i += 1) {
      children[i].classList.toggle('lit', i < stars);
    }
    this.wanted.classList.toggle('hot', stars >= 4);
  }

  setWeapon(name, ammo, reserve) {
    this.weaponName.textContent = name;
    this.weaponAmmo.textContent = `${ammo} / ${reserve}`;
    this.weapon.classList.toggle('empty', ammo === 0);
  }

  setMission(chapter, title, objective) {
    if (chapter) this.kicker.textContent = chapter;
    if (title) this.title.textContent = title;
    if (objective !== undefined) this.objective.textContent = objective;
    const card = this.root.querySelector('.mission-card');
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.timer.textContent = '';
      this.timer.classList.remove('visible');
      return;
    }
    const clamped = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(clamped / 60);
    const rest = String(clamped % 60).padStart(2, '0');
    this.timer.textContent = `${minutes}:${rest}`;
    this.timer.classList.add('visible');
    this.timer.classList.toggle('urgent', clamped <= 15);
  }

  setActivity(title, objective) {
    if (!title) {
      this.activity.classList.add('hidden');
      return;
    }
    this.activityTitle.textContent = title;
    this.activityObjective.textContent = objective ?? '';
    this.activity.classList.remove('hidden');
  }

  setActivityTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.activityTimer.textContent = '';
      return;
    }
    const clamped = Math.max(0, Math.ceil(seconds));
    this.activityTimer.textContent = `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
  }

  setWaypoint(angle, distance, visible = true) {
    this.waypoint.classList.toggle('hidden', !visible || distance < 3);
    if (!visible) return;
    this.waypointArrow.style.transform = `rotate(${angle}rad)`;
    this.waypointDistance.textContent = distance > 999 ? `${(distance / 1000).toFixed(1)} KM` : `${Math.round(distance)} M`;
  }

  showPrompt(text, key = 'E') {
    if (!text) {
      this.prompt.classList.remove('visible');
      this.promptText = null;
      return;
    }
    if (this.promptText === text) {
      this.prompt.classList.add('visible');
      return;
    }
    this.promptText = text;
    this.prompt.textContent = '';
    this.prompt.append(element('span', 'prompt-key', key), element('span', 'prompt-text', text));
    this.prompt.classList.add('visible');
  }

  clearPrompt() {
    this.showPrompt(null);
  }

  spawnMessage(text, color = '#ffe2a6') {
    const node = element('div', 'toast', text);
    node.style.color = color;
    this.messages.appendChild(node);
    void node.offsetWidth;
    node.classList.add('in');
    setTimeout(() => {
      node.classList.remove('in');
      setTimeout(() => node.remove(), 400);
    }, 2600);
  }

  spawnDamage(position, amount, hostile = false) {
    const node = element('div', `damage-number${hostile ? ' hostile' : ''}`, String(Math.round(amount)));
    this.damageLayer.appendChild(node);
    const drift = (((this.damageNumbers.length * 0.618) % 1) - 0.5) * 26;
    this.damageNumbers.push({ node, position: position.clone(), life: 0.9, drift });
    if (this.damageNumbers.length > 14) {
      const old = this.damageNumbers.shift();
      old.node.remove();
    }
  }

  updateDamage(dt, camera) {
    if (!camera) return;
    for (let i = this.damageNumbers.length - 1; i >= 0; i -= 1) {
      const entry = this.damageNumbers[i];
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.node.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      this.project.copy(entry.position).project(camera);
      if (this.project.z > 1) {
        entry.node.style.opacity = '0';
        continue;
      }
      const x = (this.project.x * 0.5 + 0.5) * 1280 + entry.drift * (1 - entry.life);
      const y = (-this.project.y * 0.5 + 0.5) * 720 - (1 - entry.life) * 44;
      entry.node.style.transform = `translate(${x}px, ${y}px)`;
      entry.node.style.opacity = String(Math.min(1, entry.life * 2.2));
    }
  }

  showFail(title, text) {
    this.failTitle.textContent = title || 'MISSION FAILED';
    this.failText.textContent = text || '';
    this.fail.classList.remove('hidden');
  }

  hideFail() {
    this.fail.classList.add('hidden');
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  update(player, vehicle, driving, time, camera, extras) {
    this.minimap.draw(player, vehicle, driving, time, extras);
    if (camera) this.updateDamage(1 / 60, camera);
  }
}
