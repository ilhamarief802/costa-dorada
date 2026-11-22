// The circular minimap, painted from the same plan the world is built from: roads, blocks,
// beach, marina, objective diamond and the player arrow. North is up, the player is centred.
import config from '../core/config.js';

export default class Minimap {
  constructor(root, plan) {
    this.plan = plan;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 320;
    this.canvas.className = 'minimap-canvas';
    this.canvas.setAttribute('aria-label', 'City minimap');
    root.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.scale = 1.28;
    this.radius = 160;
    this.timer = 0;
    this.mission = null;
    this.activity = null;
  }

  setMission(marker) {
    this.mission = marker;
  }

  setActivity(marker) {
    this.activity = marker;
  }

  worldToScreen(x, z, px, pz) {
    return {
      x: this.radius + (x - px) * this.scale,
      y: this.radius + (z - pz) * this.scale,
    };
  }

  draw(player, vehicle, driving, time, extras = {}) {
    const context = this.context;
    const size = 320;
    const px = driving ? vehicle.pos.x : player.pos.x;
    const pz = driving ? vehicle.pos.z : player.pos.z;
    context.save();
    context.clearRect(0, 0, size, size);
    context.beginPath();
    context.arc(this.radius, this.radius, this.radius - 2, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = '#141a20';
    context.fillRect(0, 0, size, size);

    const toScreen = (x, z) => this.worldToScreen(x, z, px, pz);

    // Sea and sand first, then the grid of streets and blocks.
    const seaTop = toScreen(0, 391).y;
    if (seaTop < size) {
      context.fillStyle = '#1b5360';
      context.fillRect(0, seaTop, size, size - seaTop);
    }
    const sandTop = toScreen(0, 338).y;
    context.fillStyle = '#c0a67c';
    context.fillRect(0, sandTop, size, Math.min(size, seaTop) - sandTop);

    const half = config.road / 2;
    for (const road of this.plan.roads.x) {
      const point = toScreen(road, 0);
      if (point.x < -40 || point.x > size + 40) continue;
      context.fillStyle = '#242a31';
      context.fillRect(point.x - half * this.scale, 0, config.road * this.scale, size);
    }
    for (const road of this.plan.roads.z) {
      const point = toScreen(0, road);
      if (point.y < -40 || point.y > size + 40) continue;
      context.fillStyle = '#242a31';
      context.fillRect(0, point.y - half * this.scale, size, config.road * this.scale);
    }
    for (const block of this.plan.blocks) {
      const point = toScreen(block.x, block.z);
      const halfSize = (config.block / 2) * this.scale;
      if (point.x + halfSize < -30 || point.x - halfSize > size + 30) continue;
      if (point.y + halfSize < -30 || point.y - halfSize > size + 30) continue;
      if (block.type === 'downtown') context.fillStyle = '#887f84';
      else if (block.type === 'park') context.fillStyle = '#4e6344';
      else if (block.type === 'plaza') context.fillStyle = '#c9bda6';
      else if (block.type === 'marina') context.fillStyle = '#b4a184';
      else context.fillStyle = '#a99e8c';
      context.fillRect(point.x - halfSize, point.y - halfSize, halfSize * 2, halfSize * 2);
    }

    // Marina piers reach into the bay.
    if (this.plan.marina) {
      context.fillStyle = '#7a5c3d';
      for (const pier of this.plan.marina.piers) {
        const point = toScreen(pier.x, pier.z);
        context.fillRect(point.x - (pier.w / 2) * this.scale, point.y - (pier.d / 2) * this.scale, pier.w * this.scale, pier.d * this.scale);
      }
    }

    // Traffic shows as small grey dashes so the map feels alive.
    if (extras.traffic) {
      context.fillStyle = '#5c646d';
      for (const car of extras.traffic) {
        const point = toScreen(car.x, car.z);
        if (point.x < 4 || point.x > size - 4 || point.y < 4 || point.y > size - 4) continue;
        context.fillRect(point.x - 1.4, point.y - 2.4, 2.8, 4.8);
      }
    }
    // Pursuit units flash red/blue at their last known position.
    if (extras.cruisers) {
      for (const cruiser of extras.cruisers) {
        const point = toScreen(cruiser.x, cruiser.z);
        if (point.x < -10 || point.x > size + 10 || point.y < -10 || point.y > size + 10) continue;
        context.fillStyle = cruiser.flip ? '#ff4030' : '#4a7cff';
        context.beginPath();
        context.arc(point.x, point.y, 4.2, 0, Math.PI * 2);
        context.fill();
      }
    }

    const drawMarker = (marker, color, diamond) => {
      if (!marker) return;
      const point = toScreen(marker.x, marker.z);
      const dx = point.x - this.radius;
      const dy = point.y - this.radius;
      const distance = Math.hypot(dx, dy);
      const limit = this.radius - 20;
      let ox = point.x;
      let oy = point.y;
      if (distance > limit) {
        ox = this.radius + (dx / distance) * limit;
        oy = this.radius + (dy / distance) * limit;
      }
      context.save();
      context.translate(ox, oy);
      if (diamond) context.rotate(Math.PI / 4);
      context.fillStyle = color;
      context.strokeStyle = '#1a1a18';
      context.lineWidth = 2;
      context.fillRect(-6, -6, 12, 12);
      context.strokeRect(-6, -6, 12, 12);
      context.restore();
    };
    const missionMarker = this.mission ?? this.plan.objective;
    drawMarker(missionMarker, '#f0c063', true);
    if (this.activity) drawMarker(this.activity, '#e0543f', false);

    if (driving) {
      const car = toScreen(vehicle.pos.x, vehicle.pos.z);
      context.save();
      context.translate(car.x, car.y);
      context.rotate(Math.PI - vehicle.yaw);
      context.fillStyle = '#7fc7d3';
      context.fillRect(-4, -7, 8, 14);
      context.restore();
    }

    const heading = driving ? vehicle.yaw : player.yaw;
    context.save();
    context.translate(this.radius, this.radius);
    context.rotate(Math.PI - heading);
    context.beginPath();
    context.moveTo(0, -11);
    context.lineTo(7.5, 8);
    context.lineTo(0, 4);
    context.lineTo(-7.5, 8);
    context.closePath();
    context.fillStyle = '#fff4df';
    context.strokeStyle = '#15181c';
    context.lineWidth = 2.4;
    context.fill();
    context.stroke();
    context.restore();

    const north = toScreen(0, pz - 260);
    context.fillStyle = 'rgba(255,244,223,0.85)';
    context.font = '700 16px "Arial Narrow", "Helvetica Neue", sans-serif';
    context.textAlign = 'center';
    context.fillText('N', this.radius, Math.max(18, north.y + 6));

    context.restore();
    void time;
  }
}
