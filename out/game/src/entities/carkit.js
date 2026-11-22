// Car bodies built by lofting rounded cross-sections along the length axis. Every silhouette
// in the game (coupe, sedan, van, taxi, cruiser) comes from one table of sections, so a car is
// a continuous rounded shell with a real bonnet, cabin shoulder, boot and taper — not a stack
// of boxes. Wheels, arches, bumpers, glass and lamps are added as small trim parts.
//
// A car is returned as two geometries: `paint` (tinted per instance) and `trim` (glass, rubber,
// chrome, lamps — the same on every car), plus the wheel stations so the caller can spin them.
const THREE = globalThis.THREE;

/** Round a section corner: |x|^p in a unit box, mirrored into an ellipse-ish outline. */
function sectionRing(section, segments) {
  const { halfWidth, bottom, top, power = 3.4, shoulder = 0.5 } = section;
  const centre = (bottom + top) / 2;
  const halfHeight = (top - bottom) / 2;
  const points = [];
  const exponent = 2 / power;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    // Widen the shoulders: the upper half is slightly fuller than the lower, like a real body.
    const widen = cy > 0 ? 1 + (shoulder - 0.5) * cy * 0.5 : 1 - (0.5 - shoulder) * -cy * 0.5;
    const x = halfWidth * widen * Math.sign(cx) * Math.abs(cx) ** exponent;
    const y = centre + halfHeight * Math.sign(cy) * Math.abs(cy) ** exponent;
    points.push({ x, y });
  }
  return points;
}

/**
 * Loft a list of sections into one closed shell. Sections run along +Z; the first and last are
 * capped. Returns a non-indexed BufferGeometry with normals, ready for a standard material.
 */
function loft(sections, segments = 16) {
  const rings = sections.map((section) => sectionRing(section, segments));
  const positions = [];
  const push = (p, z) => positions.push(p.x, p.y, z);
  for (let s = 0; s < sections.length - 1; s += 1) {
    const a = rings[s];
    const b = rings[s + 1];
    const za = sections[s].z;
    const zb = sections[s + 1].z;
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      // Two triangles per quad, wound outward.
      push(a[i], za);
      push(a[j], za);
      push(b[j], zb);
      push(a[i], za);
      push(b[j], zb);
      push(b[i], zb);
    }
  }
  // Caps: fan from the ring centroid.
  const cap = (ring, z, flip) => {
    let cx = 0;
    let cy = 0;
    for (const p of ring) {
      cx += p.x;
      cy += p.y;
    }
    cx /= ring.length;
    cy /= ring.length;
    for (let i = 0; i < ring.length; i += 1) {
      const j = (i + 1) % ring.length;
      if (flip) {
        positions.push(cx, cy, z, ring[j].x, ring[j].y, z, ring[i].x, ring[i].y, z);
      } else {
        positions.push(cx, cy, z, ring[i].x, ring[i].y, z, ring[j].x, ring[j].y, z);
      }
    }
  };
  cap(rings[0], sections[0].z, true);
  cap(rings[rings.length - 1], sections[sections.length - 1].z, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Concatenate geometries that share a position+normal layout into one. */
function merge(list) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  let offset = 0;
  for (const item of list) {
    const { geometry, matrix, uvScale } = item;
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = geo.attributes.position;
    const normal = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      if (matrix) v.applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      n.fromBufferAttribute(normal, i);
      if (normalMatrix) n.applyMatrix3(normalMatrix).normalize();
      normals.push(n.x, n.y, n.z);
      if (uv) uvs.push(uv.getX(i) * (uvScale?.[0] ?? 1), uv.getY(i) * (uvScale?.[1] ?? 1));
      else uvs.push(0, 0);
    }
    index.push(...Array.from({ length: position.count }, (_, i) => i + offset));
    offset += position.count;
    if (geo !== geometry) geo.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return result;
}

const transform = (position, rotation, scale) => {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  if (rotation) quaternion.setFromEuler(new THREE.Euler(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0));
  matrix.compose(
    new THREE.Vector3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0),
    quaternion,
    new THREE.Vector3(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1),
  );
  return matrix;
};

/** A half-cylinder arch liner, so the wheels sit in a visible cut-out rather than floating. */
function archGeometry(radius, width, arc = Math.PI * 1.02) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 12, 1, true, 0, arc);
  geometry.rotateZ(Math.PI / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// Body profiles, in metres. z runs from the tail (-) to the nose (+).
const PROFILES = {
  coupe: {
    sections: [
      { z: -2.18, halfWidth: 0.7, bottom: 0.4, top: 0.74, power: 3.2 },
      { z: -2.02, halfWidth: 0.88, bottom: 0.34, top: 0.84, power: 3.4 },
      { z: -1.56, halfWidth: 0.94, bottom: 0.3, top: 0.93, power: 3.6 },
      { z: -0.6, halfWidth: 0.96, bottom: 0.28, top: 0.99, power: 3.8 },
      { z: 0.5, halfWidth: 0.96, bottom: 0.28, top: 0.98, power: 3.8 },
      { z: 1.44, halfWidth: 0.93, bottom: 0.31, top: 0.9, power: 3.6 },
      { z: 1.94, halfWidth: 0.85, bottom: 0.36, top: 0.79, power: 3.4 },
      { z: 2.16, halfWidth: 0.68, bottom: 0.42, top: 0.7, power: 3.2 },
    ],
    cabin: [
      { z: -1.5, halfWidth: 0.66, bottom: 0.9, top: 1.02, power: 4.2 },
      { z: -1.2, halfWidth: 0.7, bottom: 0.92, top: 1.24, power: 4.4 },
      { z: -0.2, halfWidth: 0.72, bottom: 0.94, top: 1.34, power: 4.6 },
      { z: 0.5, halfWidth: 0.7, bottom: 0.94, top: 1.3, power: 4.4 },
      { z: 0.94, halfWidth: 0.62, bottom: 0.92, top: 1.02, power: 4.0 },
    ],
    wheels: [[-1.44, 0.86], [1.42, 0.86]],
    wheelRadius: 0.35,
    track: 0.84,
    lampY: 0.72,
    nose: 2.16,
    tail: -2.18,
    roof: 1.36,
  },
  sedan: {
    sections: [
      { z: -2.34, halfWidth: 0.72, bottom: 0.4, top: 0.82, power: 3.2 },
      { z: -2.16, halfWidth: 0.9, bottom: 0.34, top: 0.92, power: 3.4 },
      { z: -1.7, halfWidth: 0.96, bottom: 0.3, top: 0.98, power: 3.6 },
      { z: -0.5, halfWidth: 0.98, bottom: 0.28, top: 1.0, power: 3.8 },
      { z: 0.7, halfWidth: 0.98, bottom: 0.28, top: 0.99, power: 3.8 },
      { z: 1.66, halfWidth: 0.94, bottom: 0.31, top: 0.92, power: 3.6 },
      { z: 2.12, halfWidth: 0.86, bottom: 0.36, top: 0.82, power: 3.4 },
      { z: 2.3, halfWidth: 0.7, bottom: 0.42, top: 0.74, power: 3.2 },
    ],
    cabin: [
      { z: -1.86, halfWidth: 0.66, bottom: 0.94, top: 1.06, power: 4.2 },
      { z: -1.5, halfWidth: 0.72, bottom: 0.96, top: 1.36, power: 4.4 },
      { z: -0.3, halfWidth: 0.74, bottom: 0.98, top: 1.44, power: 4.6 },
      { z: 0.62, halfWidth: 0.72, bottom: 0.98, top: 1.4, power: 4.4 },
      { z: 1.06, halfWidth: 0.64, bottom: 0.96, top: 1.06, power: 4.0 },
    ],
    wheels: [[-1.6, 0.88], [1.58, 0.88]],
    wheelRadius: 0.36,
    track: 0.86,
    lampY: 0.78,
    nose: 2.3,
    tail: -2.34,
    roof: 1.46,
  },
  van: {
    sections: [
      { z: -2.62, halfWidth: 0.78, bottom: 0.42, top: 1.5, power: 3.0 },
      { z: -2.5, halfWidth: 0.94, bottom: 0.36, top: 1.62, power: 3.2 },
      { z: -1.4, halfWidth: 0.99, bottom: 0.32, top: 1.66, power: 3.4 },
      { z: 0.4, halfWidth: 1.0, bottom: 0.3, top: 1.66, power: 3.4 },
      { z: 1.6, halfWidth: 0.98, bottom: 0.32, top: 1.58, power: 3.4 },
      { z: 2.2, halfWidth: 0.9, bottom: 0.38, top: 1.3, power: 3.4 },
      { z: 2.46, halfWidth: 0.74, bottom: 0.46, top: 1.02, power: 3.2 },
    ],
    cabin: [
      { z: 1.5, halfWidth: 0.76, bottom: 1.06, top: 1.62, power: 4.6 },
      { z: 2.06, halfWidth: 0.72, bottom: 1.0, top: 1.5, power: 4.2 },
    ],
    wheels: [[-1.78, 0.9], [1.7, 0.9]],
    wheelRadius: 0.39,
    track: 0.88,
    lampY: 0.92,
    nose: 2.46,
    tail: -2.62,
    roof: 1.7,
  },
  taxi: {
    sections: [
      { z: -2.24, halfWidth: 0.72, bottom: 0.42, top: 0.8, power: 3.2 },
      { z: -2.08, halfWidth: 0.9, bottom: 0.36, top: 0.92, power: 3.4 },
      { z: -1.66, halfWidth: 0.96, bottom: 0.32, top: 0.98, power: 3.6 },
      { z: -0.5, halfWidth: 0.98, bottom: 0.3, top: 1.0, power: 3.8 },
      { z: 0.66, halfWidth: 0.98, bottom: 0.3, top: 0.99, power: 3.8 },
      { z: 1.62, halfWidth: 0.94, bottom: 0.33, top: 0.93, power: 3.6 },
      { z: 2.06, halfWidth: 0.86, bottom: 0.38, top: 0.83, power: 3.4 },
      { z: 2.22, halfWidth: 0.7, bottom: 0.44, top: 0.75, power: 3.2 },
    ],
    cabin: [
      { z: -1.78, halfWidth: 0.66, bottom: 0.94, top: 1.04, power: 4.2 },
      { z: -1.44, halfWidth: 0.72, bottom: 0.96, top: 1.38, power: 4.4 },
      { z: -0.3, halfWidth: 0.74, bottom: 0.98, top: 1.46, power: 4.6 },
      { z: 0.6, halfWidth: 0.72, bottom: 0.98, top: 1.42, power: 4.4 },
      { z: 1.02, halfWidth: 0.64, bottom: 0.96, top: 1.04, power: 4.0 },
    ],
    wheels: [[-1.54, 0.88], [1.52, 0.88]],
    wheelRadius: 0.35,
    track: 0.86,
    lampY: 0.78,
    nose: 2.22,
    tail: -2.24,
    roof: 1.48,
  },
  // Police interceptor: the sedan shell with wider arches and a longer nose.
  cruiser: {
    sections: [
      { z: -2.4, halfWidth: 0.74, bottom: 0.42, top: 0.84, power: 3.2 },
      { z: -2.24, halfWidth: 0.92, bottom: 0.36, top: 0.95, power: 3.4 },
      { z: -1.76, halfWidth: 0.99, bottom: 0.32, top: 1.01, power: 3.6 },
      { z: -0.5, halfWidth: 1.01, bottom: 0.3, top: 1.03, power: 3.8 },
      { z: 0.72, halfWidth: 1.0, bottom: 0.3, top: 1.02, power: 3.8 },
      { z: 1.7, halfWidth: 0.96, bottom: 0.33, top: 0.95, power: 3.6 },
      { z: 2.16, halfWidth: 0.88, bottom: 0.38, top: 0.85, power: 3.4 },
      { z: 2.38, halfWidth: 0.72, bottom: 0.44, top: 0.77, power: 3.2 },
    ],
    cabin: [
      { z: -1.9, halfWidth: 0.68, bottom: 0.96, top: 1.08, power: 4.2 },
      { z: -1.54, halfWidth: 0.74, bottom: 0.98, top: 1.4, power: 4.4 },
      { z: -0.3, halfWidth: 0.76, bottom: 1.0, top: 1.48, power: 4.6 },
      { z: 0.64, halfWidth: 0.74, bottom: 1.0, top: 1.44, power: 4.4 },
      { z: 1.1, halfWidth: 0.66, bottom: 0.98, top: 1.08, power: 4.0 },
    ],
    wheels: [[-1.64, 0.9], [1.62, 0.9]],
    wheelRadius: 0.37,
    track: 0.88,
    lampY: 0.8,
    nose: 2.38,
    tail: -2.4,
    roof: 1.5,
  },
};

/**
 * Build one silhouette. Returns `{ paint, trim, wheels, spec }` where `paint` and `trim` are
 * merged geometries in the car's local space (+Z forward, y=0 at the ground) and `wheels` lists
 * the axle stations with their radius.
 */
export function buildCar(kind = 'coupe', options = {}) {
  const profile = PROFILES[kind] ?? PROFILES.coupe;
  const paintParts = [{ geometry: loft(profile.sections, 18) }];
  const trimParts = [];

  // Glass house. Slightly inset from the body shoulder, tinted and reflective.
  const cabin = loft(profile.cabin, 16);
  trimParts.push({ geometry: cabin });

  // Roof cap in body paint, so the glass is a band rather than a bubble.
  const cabinMidIndex = Math.floor((profile.cabin.length - 1) / 2);
  const cabinMid = profile.cabin[Math.min(cabinMidIndex + 1, profile.cabin.length - 1)];
  const roofZ = (profile.cabin[1].z + profile.cabin[profile.cabin.length - 2].z) / 2;
  paintParts.push({
    geometry: new THREE.BoxGeometry(cabinMid.halfWidth * 1.94, 0.07, 0.9),
    matrix: transform([0, profile.roof - 0.02, roofZ]),
  });

  // Wheel arches and sills in matte trim.
  for (const [z, ] of profile.wheels) {
    const arch = archGeometry(profile.wheelRadius + 0.11, 0.1);
    trimParts.push({
      geometry: arch,
      matrix: transform([profile.track + 0.03, profile.wheelRadius + 0.02, z]),
    });
    trimParts.push({
      geometry: arch,
      matrix: transform([-(profile.track + 0.03), profile.wheelRadius + 0.02, z]),
    });
  }
  trimParts.push({
    geometry: new THREE.BoxGeometry(1.94, 0.1, profile.nose - profile.tail - 0.7),
    matrix: transform([0, 0.3, (profile.nose + profile.tail) / 2]),
  });

  // Bumpers: a wide chrome bar front and rear.
  trimParts.push({
    geometry: new THREE.BoxGeometry(1.86, 0.17, 0.14),
    matrix: transform([0, profile.lampY - 0.24, profile.nose - 0.02]),
  });
  trimParts.push({
    geometry: new THREE.BoxGeometry(1.86, 0.17, 0.14),
    matrix: transform([0, profile.lampY - 0.22, profile.tail + 0.02]),
  });
  // Grille and headlamps.
  trimParts.push({
    geometry: new THREE.BoxGeometry(1.0, 0.15, 0.06),
    matrix: transform([0, profile.lampY + 0.04, profile.nose - 0.03]),
  });
  for (const side of [-1, 1]) {
    trimParts.push({
      geometry: new THREE.BoxGeometry(0.36, 0.13, 0.06),
      matrix: transform([side * 0.62, profile.lampY + 0.08, profile.nose - 0.04]),
    });
    trimParts.push({
      geometry: new THREE.BoxGeometry(0.3, 0.1, 0.06),
      matrix: transform([side * 0.6, profile.lampY + 0.12, profile.tail + 0.04]),
    });
    // Mirrors.
    trimParts.push({
      geometry: new THREE.BoxGeometry(0.2, 0.09, 0.13),
      matrix: transform([side * (cabinMid.halfWidth + 0.16), cabinMid.top - 0.12, cabinMid.z]),
    });
  }
  if (options.taxiSign) {
    trimParts.push({
      geometry: new THREE.BoxGeometry(0.62, 0.2, 0.3),
      matrix: transform([0, profile.roof + 0.1, roofZ + 0.1]),
    });
  }

  return {
    paint: merge(paintParts),
    trim: merge(trimParts),
    lamps: null,
    wheels: profile.wheels.map(([z, halfTrack]) => ({ z, x: halfTrack })),
    spec: profile,
  };
}

/** A wheel: tyre cylinder plus a bright rim disc and four spokes, merged into one geometry. */
export function buildWheel(radius = 0.35, width = 0.26) {
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 16, 1);
  tyre.rotateZ(Math.PI / 2);
  const parts = [{ geometry: tyre }];
  const rim = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.012, 12);
  rim.rotateZ(Math.PI / 2);
  parts.push({ geometry: rim });
  for (let i = 0; i < 4; i += 1) {
    parts.push({
      geometry: new THREE.BoxGeometry(width + 0.018, 0.055, radius * 1.1),
      matrix: transform([0, 0, 0], [0, 0, (i / 4) * Math.PI * 2]),
    });
  }
  return merge(parts);
}

export { merge as mergeGeometry, transform as transformMatrix, loft };
export default { buildCar, buildWheel, merge, transform, loft };
