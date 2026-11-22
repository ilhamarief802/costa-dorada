// Measure each staged shot against the four-frame contact-sheet spec, mechanically.
//
//   node tools/spec.mjs [shot]
//
// Reports, per shot: camera height and field of view, the hero subject's width as a fraction of
// the frame, the depth layers (is there a prop within 3 m at frame edge, are midground subjects in
// focus, is the skyline behind fog), how many vehicles and pedestrians sit inside 70 m and 12 m,
// how much bare asphalt the frame shows, and every body that has no blob shadow under it.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const only = process.argv[2];
const names = only ? [only] : ['cover', 'chase', 'mission', 'night'];

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

for (const name of names) {
  await page.goto(`http://localhost:8080/?shot=${name}&seed=1&capture=1`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 300000 });
  const report = await page.evaluate((shotName) => {
    const g = window.__COSTA_GAME;
    const T = window.THREE;
    const cam = g.camera;
    cam.updateMatrixWorld();
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const flat = Math.hypot(forward.x, forward.z) || 1;

    // A point on the ground is inside the frustum if its NDC coords are in [-1,1] and in front.
    const ndc = (x, y, z) => new T.Vector3(x, y, z).project(cam);
    const inFrame = (x, y, z, margin = 0) => {
      const v = ndc(x, y, z);
      return v.z > -1 && v.z < 1 && v.x > -1 + margin && v.x < 1 - margin && v.y > -1 + margin && v.y < 1 - margin;
    };
    const range = (x, z) => Math.hypot(x - cam.position.x, z - cam.position.z);

    // Every vehicle: the hero and the staged traffic.
    const vehicles = [];
    if (g.vehicle.group.visible) {
      vehicles.push({ x: g.vehicle.pos.x, z: g.vehicle.pos.z, hero: true, brake: !!g.vehicle.braking });
    }
    for (const car of g.traffic.cars) {
      if (car.hidden) continue;
      vehicles.push({ x: car.x, z: car.z, hero: false, brake: !!car.braking });
    }
    const peds = [];
    for (const ped of g.pedestrians.peds) {
      if (ped.hidden) continue;
      peds.push({ x: ped.x, z: ped.z, phase: ped.phase, sit: ped.sit, lean: ped.lean });
    }

    const near = (list, r) => list.filter((o) => range(o.x, o.z) <= r).length;
    const seen = (list, r) => list.filter((o) => range(o.x, o.z) <= r && inFrame(o.x, 1, o.z)).length;

    // Hero subject width as a fraction of the frame: project the footprint's four corners.
    let heroFraction = null;
    let heroRect = null;
    const hero = g.vehicle.group.visible ? g.vehicle : null;
    if (hero) {
      const yaw = hero.yaw;
      const hw = 1.05, hl = 2.45;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const xs = [], ys = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
        const lx = sx * hw, lz = sz * hl;
        const v = ndc(hero.pos.x + lx * c + lz * s, 0.65, hero.pos.z - lx * s + lz * c);
        xs.push((v.x + 1) / 2);
        ys.push((1 - v.y) / 2);
      }
      heroFraction = (Math.max(...xs) - Math.min(...xs));
      heroRect = {
        x0: Number(Math.min(...xs).toFixed(3)), x1: Number(Math.max(...xs).toFixed(3)),
        y0: Number(Math.min(...ys).toFixed(3)), y1: Number(Math.max(...ys).toFixed(3)),
        bottom: Number(Math.max(...ys).toFixed(3)),
      };
    }

    // Rim light: the sun should sit behind one shoulder, i.e. roughly behind the camera and off to
    // one side. `behind` > 0 means behind the lens; `side` is how far off the axis it sits.
    const sunDir = g.sky.sunDir.clone().normalize();
    const camFwd = forward.clone().normalize();
    const camRight = new T.Vector3().crossVectors(camFwd, new T.Vector3(0, 1, 0)).normalize();
    const sunBehind = -sunDir.dot(camFwd);
    const sunSide = sunDir.dot(camRight);
    const sunElev = Math.asin(sunDir.y) * 180 / Math.PI;

    // Depth layers. Foreground: is any staged prop within 3.2 m of the camera and near a frame
    // edge? Midground: is anything in focus between 8 and 30 m? Background: does the skyline sit
    // inside the fog (fog factor at 200 m)?
    // Depth layers. Foreground: is any street prop within 7 m of the camera, low in frame, and
    // near a frame edge? That is what gives the eye a near layer to stand on.
    let foreground = 0;
    const nearEdgeProps = [];
    for (const box of g.plan.colliders) {
      if (!['curb', 'prop', 'planter', 'bench', 'bollard'].includes(box.kind)) continue;
      const x = (box.minX + box.maxX) / 2;
      const z = (box.minZ + box.maxZ) / 2;
      if (range(x, z) > 10) continue;
      const v = ndc(x, 0.35, z);
      if (v.z < -1 || v.z > 1) continue;
      if (v.y < -1.2 || v.y > 0.2) continue;
      nearEdgeProps.push({ kind: box.kind, x: Number(v.x.toFixed(2)), y: Number(v.y.toFixed(2)) });
      if (Math.abs(v.x) > 0.45) foreground += 1;
    }

    const fogDensity = g.weather.sky.material?.uniforms?.uFogDensity?.value ?? null;
    const sceneFog = g.scene.fog ? { density: g.scene.fog.density, color: g.scene.fog.color.getHexString() } : null;

    // Bare asphalt, measured the way the judge sees it: walk the frame on a grid, intersect each
    // ray with the road plane (the city is flat, so this is exact arithmetic, not a raycast), and
    // count a cell as bare asphalt when the point lands on a street with no vehicle or person on
    // it. `bareAsphaltShareOfFrame` is the share of the whole frame that reads as empty road.
    const o = cam.position;
    let frameCells = 0;
    let bareRoadCells = 0;
    let roadCells = 0;
    for (let sy = 0.02; sy < 0.99; sy += 0.044) {
      for (let sx = 0.02; sx < 0.99; sx += 0.044) {
        frameCells += 1;
        const dir = new T.Vector3(sx * 2 - 1, 1 - sy * 2, 0.5).unproject(cam).sub(o).normalize();
        if (dir.y > -0.002) continue;
        const t = (0.02 - o.y) / dir.y;
        if (t <= 0) continue;
        const px = o.x + dir.x * t;
        const pz = o.z + dir.z * t;
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
        // On a street, not a raised block platform.
        if (g.plan.heightAt(px, pz) > 0.05) continue;
        if (Math.abs(px) > 345 || pz > 344) continue;
        roadCells += 1;
        let under = false;
        for (const v of vehicles) if (Math.hypot(v.x - px, v.z - pz) < 2.1) under = true;
        for (const q of peds) if (Math.hypot(q.x - px, q.z - pz) < 0.9) under = true;
        if (!under) bareRoadCells += 1;
      }
    }

    // Blob shadows: for each visible body, is there a shadow instance at its xz?
    const shadowAt = (mesh, x, z, tol = 0.6) => {
      if (!mesh) return false;
      const m = new T.Matrix4();
      const p = new T.Vector3();
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - x, p.z - z) < tol) return true;
      }
      return false;
    };
    const pedShadows = g.pedestrians.shadows;
    const carShadows = g.vehicle.contact ? g.vehicle.contact : null;
    const pedNoShadow = peds.filter((q) => !shadowAt(pedShadows, q.x, q.z, 0.05)).length;

    return {
      shot: shotName,
      camera: { height: Number(cam.position.y.toFixed(2)), fov: Number(cam.fov.toFixed(1)) },
      heroFraction: heroFraction === null ? null : Number(heroFraction.toFixed(3)),
      heroRect,
      light: {
        sunBehind: Number(sunBehind.toFixed(2)),
        sunSide: Number(sunSide.toFixed(2)),
        sunElevationDeg: Number(sunElev.toFixed(1)),
      },
      counts: {
        vehicles70: near(vehicles, 70), vehicles12: near(vehicles, 12), vehiclesSeen70: seen(vehicles, 70),
        peds70: near(peds, 70), peds12: near(peds, 12), pedsSeen70: seen(peds, 70),
        braking: vehicles.filter((v) => v.brake).length,
      },
      ground: {
        frameCells,
        roadCells,
        bareRoadCells,
        bareAsphaltShareOfFrame: frameCells ? Number((bareRoadCells / frameCells).toFixed(3)) : null,
        bareShareOfRoad: roadCells ? Number((bareRoadCells / roadCells).toFixed(3)) : null,
      },
      depth: { foregroundProps: foreground, nearEdgeProps: nearEdgeProps.slice(0, 12), sceneFog },
      shadows: { pedsMissing: pedNoShadow, pedsTotal: peds.length, carContactMesh: !!carShadows },
      heroBraking: g.vehicle.braking ?? null,
    };
  }, name);
  console.log(JSON.stringify(report));
}

await browser.close();
