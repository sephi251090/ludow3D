import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { HEAD, cheekWidening, headZ, headPoint, headNormal, strandGeometry, smoothOutlineGeometry } from './geometry.js';
import { buildFaceGeometry, FACE_MATERIALS } from './face.js';

/**
 * Construit le modèle 3D de Ludo, entièrement procédural (aucun asset externe).
 *
 * Options :
 *  - materials: 'toon' (rendu cel-shading fidèle au sprite) | 'standard' (PBR, pour export glTF)
 *  - outlines: ajoute les contours "coque inversée" façon pixel-art (temps réel uniquement)
 *
 * Hiérarchie (noms stables, utilisables depuis n'importe quel moteur) :
 *   Ludo
 *   ├─ Body (Torso, Collar, Neck, Logo)
 *   └─ HeadPivot            ← rotation de la tête (cou)
 *      └─ Head (HeadMesh, Ludo_Face, Nose, Glasses, Bangs, SideLocks)
 *         ├─ EarPivot_L / EarPivot_R
 *         └─ PonytailPivot
 */
export function buildLudo({ materials = 'toon', outlines = true } = {}) {
  const mats = createMaterials(materials);
  const root = new THREE.Group();
  root.name = 'Ludo';

  const addMesh = (parent, geometry, material, name, { outline = true, outlineWidth = 0.012 } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    if (outlines && outline) mesh.add(makeOutline(geometry, outlineWidth));
    return mesh;
  };

  // ---------------------------------------------------------------- Corps
  const body = new THREE.Group();
  body.name = 'Body';
  body.position.y = 0.22;
  root.add(body);

  const torsoProfile = [
    [0.0, -0.84], [0.2, -0.84], [0.32, -0.87], [0.46, -0.92], [0.56, -1.0],
    [0.61, -1.12], [0.63, -1.35], [0.62, -1.7], [0.0, -1.7],
  ];
  const TORSO_Z = 0.62;
  const torsoGeo = new THREE.LatheGeometry([...torsoProfile].reverse().map(([r, y]) => new THREE.Vector2(r, y)), 48);
  torsoGeo.scale(1, 1, TORSO_Z);
  torsoGeo.computeVertexNormals();
  addMesh(body, torsoGeo, mats.shirt, 'Torso');

  const torsoR = (y) => {
    for (let i = 1; i < torsoProfile.length - 1; i++) {
      const [r0, y0] = torsoProfile[i], [r1, y1] = torsoProfile[i + 1];
      if (y <= y0 && y >= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
    }
    return 0.6;
  };
  const torsoZ = (x, y, lift = 0) => TORSO_Z * Math.sqrt(Math.max(0, torsoR(y) ** 2 - x * x)) + lift;

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.035, 10, 40), mats.shirtDark);
  collar.name = 'Collar';
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.78, 1);
  collar.position.y = -0.855;
  body.add(collar);
  if (outlines) collar.add(makeOutline(collar.geometry, 0.01));

  const neckGeo = new THREE.CylinderGeometry(0.2, 0.215, 0.55, 32, 1, true);
  neckGeo.translate(0, -0.6, -0.02);
  addMesh(body, neckGeo, mats.fur, 'Neck');

  // Ombre du cou sous le menton (le "V" plus foncé du sprite).
  const neckShade = new THREE.Mesh(new THREE.CircleGeometry(0.17, 3, Math.PI / 2), mats.furShade);
  neckShade.name = 'NeckShade';
  neckShade.scale.set(0.8, 0.6, 1);
  neckShade.rotation.z = Math.PI;
  neckShade.position.set(0, -0.735, 0.212);
  body.add(neckShade);

  body.add(buildLogo(mats, torsoZ));

  // ---------------------------------------------------------------- Tête
  const headPivot = new THREE.Group();
  headPivot.name = 'HeadPivot';
  headPivot.position.set(0, -0.5, 0);
  root.add(headPivot);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.5, 0);
  headPivot.add(head);

  const headGeo = new THREE.SphereGeometry(1, 64, 48);
  headGeo.scale(HEAD.a, HEAD.b, HEAD.c);
  // Joues un peu plus larges en bas, comme sur le sprite.
  const p = headGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) * cheekWidening(p.getY(i)));
  }
  headGeo.computeVertexNormals();
  addMesh(head, headGeo, mats.fur, 'HeadMesh', { outlineWidth: 0.014 });

  // Visage : maillage unique avec toutes les morph targets.
  const face = new THREE.Mesh(buildFaceGeometry(), FACE_MATERIALS.map((m) => mats[m]));
  face.name = 'Ludo_Face';
  face.renderOrder = 2;
  head.add(face);

  // Nez : petit triangle brun.
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-0.042, 0.02);
  noseShape.lineTo(0.042, 0.02);
  noseShape.lineTo(0, -0.03);
  noseShape.closePath();
  const noseGeo = new THREE.ExtrudeGeometry(noseShape, {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2,
  });
  const nose = new THREE.Mesh(noseGeo, mats.nose);
  nose.name = 'Nose';
  nose.position.set(0, -0.145, headZ(0, -0.145) - 0.012);
  nose.rotation.x = -0.25;
  head.add(nose);

  head.add(buildGlasses(mats, outlines));

  // Oreilles.
  for (const side of [1, -1]) {
    const ear = buildEar(mats, side, outlines);
    const base = headPoint(side * 0.29, 0.36, -0.06);
    ear.position.copy(base);
    head.add(ear);
  }

  // Cheveux : frange, mèches latérales, couette.
  head.add(buildHair(mats, outlines));

  root.position.y = 1.7;
  // Non énumérable : n'est pas sérialisé dans les extras glTF.
  Object.defineProperty(root.userData, 'parts', {
    enumerable: false,
    value: {
      body, headPivot, head, face,
      earL: head.getObjectByName('EarPivot_L'),
      earR: head.getObjectByName('EarPivot_R'),
      ponytail: head.getObjectByName('PonytailPivot'),
      glasses: head.getObjectByName('Glasses'),
    },
  });
  return root;
}

// ------------------------------------------------------------------ Matériaux
let gradientMap = null;
function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([110, 110, 110, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

function createMaterials(kind) {
  const solid = (color, name, extra = {}) => {
    const m = kind === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
    m.name = name;
    return m;
  };
  const flat = (color, name) => {
    const m = new THREE.MeshBasicMaterial({
      color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    m.name = name;
    return m;
  };
  return {
    fur: solid(PALETTE.fur, 'Fur'),
    furShade: flat(PALETTE.furShade, 'FurShade'),
    furDeep: solid(PALETTE.furDeep, 'EarInner'),
    furMid: solid(PALETTE.furShade, 'EarMid'),
    shirt: solid(PALETTE.shirt, 'Shirt'),
    shirtDark: solid(PALETTE.shirtDark, 'Collar'),
    nose: solid(PALETTE.nose, 'Nose'),
    glasses: solid(PALETTE.glasses, 'Glasses'),
    lens: new THREE.MeshBasicMaterial({ color: PALETTE.lens, transparent: true, opacity: 0.12, depthWrite: false, name: 'Lens' }),
    hairTie: solid(PALETTE.hairTie, 'HairTie'),
    mouth: flat(PALETTE.mouth, 'Mouth'),
    tongue: flat(PALETTE.tongue, 'Tongue'),
    teeth: flat(PALETTE.teeth, 'Teeth'),
    eye: flat(PALETTE.eye, 'Eye'),
    eyeHighlight: flat(PALETTE.eyeHighlight, 'EyeHighlight'),
    brow: flat(PALETTE.brow, 'Brow'),
    logoOrange: flat(PALETTE.logoOrange, 'LogoOrange'),
    logoText: flat(PALETTE.logoText, 'LogoText'),
    logoGrey: flat(PALETTE.logoGrey, 'LogoGrey'),
  };
}

const outlineMaterials = new Map();
function makeOutline(geometry, width) {
  let mat = outlineMaterials.get(width);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = position + normalize(normal) * ${width.toFixed(4)};`,
      );
    };
    mat.customProgramCacheKey = () => `ludo-outline-${width}`;
    mat.name = 'Outline';
    outlineMaterials.set(width, mat);
  }
  const mesh = new THREE.Mesh(smoothOutlineGeometry(geometry), mat);
  mesh.name = 'Outline';
  mesh.userData.isOutline = true;
  return mesh;
}

// ------------------------------------------------------------------ Lunettes
function buildGlasses(mats, outlines) {
  const g = new THREE.Group();
  g.name = 'Glasses';
  const hw = 0.108, hh = 0.082, t = 0.024;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-hw, -hh); frameShape.lineTo(hw, -hh); frameShape.lineTo(hw, hh); frameShape.lineTo(-hw, hh);
  frameShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-hw + t, -hh + t); hole.lineTo(-hw + t, hh - t); hole.lineTo(hw - t, hh - t); hole.lineTo(hw - t, -hh + t);
  hole.closePath();
  frameShape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1,
  });
  frameGeo.translate(0, 0, -0.009);
  const lensGeo = new THREE.PlaneGeometry(2 * (hw - t), 2 * (hh - t));

  const ex = 0.185, ey = -0.012;
  const ez = headZ(ex, ey) + 0.045;
  for (const side of [1, -1]) {
    const frame = new THREE.Mesh(frameGeo, mats.glasses);
    frame.name = side > 0 ? 'Frame_L' : 'Frame_R';
    frame.position.set(side * ex, ey, ez);
    frame.rotation.y = side * 0.22;
    g.add(frame);
    if (outlines) frame.add(makeOutline(frameGeo, 0.006));
    const lens = new THREE.Mesh(lensGeo, mats.lens);
    lens.name = 'Lens';
    frame.add(lens);

    // Branche : du bord extérieur de la monture jusqu'au-dessus de l'oreille.
    const from = new THREE.Vector3(side * (ex + hw * Math.cos(0.22) - 0.004), ey + hh - 0.03, ez - hw * Math.sin(0.22));
    const to = new THREE.Vector3(side * (HEAD.a + 0.035), ey + 0.02, -0.12);
    const len = from.distanceTo(to);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, len), mats.glasses);
    arm.name = 'Temple';
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.lookAt(to);
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.02), mats.glasses);
  bridge.name = 'Bridge';
  bridge.position.set(0, ey + 0.035, ez + 0.012);
  g.add(bridge);
  return g;
}

// ------------------------------------------------------------------ Oreilles
function buildEar(mats, side, outlines) {
  const pivot = new THREE.Group();
  pivot.name = side > 0 ? 'EarPivot_L' : 'EarPivot_R';
  const lean = side * 0.06;
  const shape = new THREE.Shape();
  shape.moveTo(-0.17, 0);
  shape.quadraticCurveTo(-0.12, 0.22, lean - 0.01, 0.44);
  shape.lineTo(lean + 0.01, 0.44);
  shape.quadraticCurveTo(0.12, 0.22, 0.17, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 10,
  });
  geo.translate(0, 0, -0.025);
  const ear = new THREE.Mesh(geo, mats.fur);
  ear.name = side > 0 ? 'Ear_L' : 'Ear_R';
  pivot.add(ear);
  if (outlines) ear.add(makeOutline(geo, 0.012));

  const innerShape = (s, y0, y1) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.12 * s, y0);
    sh.quadraticCurveTo(-0.08 * s, (y0 + y1) / 2, lean, y1);
    sh.quadraticCurveTo(0.08 * s, (y0 + y1) / 2, 0.12 * s, y0);
    sh.closePath();
    return new THREE.ShapeGeometry(sh, 8);
  };
  const mid = new THREE.Mesh(innerShape(1, 0.02, 0.36), mats.furMid);
  mid.position.z = 0.051;
  mid.name = 'EarMid';
  pivot.add(mid);
  const inner = new THREE.Mesh(innerShape(0.62, 0.03, 0.27), mats.furDeep);
  inner.position.z = 0.053;
  inner.name = 'EarInner';
  pivot.add(inner);

  pivot.rotation.set(-0.12, side * 0.18, -side * 0.24);
  return pivot;
}

// ------------------------------------------------------------------ Cheveux
function buildHair(mats, outlines) {
  const hair = new THREE.Group();
  hair.name = 'Hair';
  const onHead = (x, y, lift) => headPoint(x, y, lift);
  const surfaceUp = (p) => headNormal(p);

  // Frange : mèches pointues partant du sommet (raie au milieu, comme le sprite).
  const bangs = [
    { root: [0.0, 0.47], mid: [-0.06, 0.34], tip: [-0.13, 0.16], w: 0.075 },
    { root: [-0.06, 0.46], mid: [-0.17, 0.33], tip: [-0.3, 0.13], w: 0.085 },
    { root: [-0.16, 0.44], mid: [-0.3, 0.3], tip: [-0.43, 0.05], w: 0.085 },
    { root: [-0.27, 0.4], mid: [-0.41, 0.24], tip: [-0.5, -0.02], w: 0.07 },
    { root: [0.03, 0.47], mid: [0.08, 0.34], tip: [0.11, 0.17], w: 0.07 },
    { root: [0.08, 0.46], mid: [0.19, 0.33], tip: [0.3, 0.14], w: 0.085 },
    { root: [0.17, 0.44], mid: [0.31, 0.3], tip: [0.44, 0.05], w: 0.085 },
    { root: [0.27, 0.4], mid: [0.41, 0.23], tip: [0.5, -0.03], w: 0.07 },
  ];
  bangs.forEach((b, i) => {
    const pts = [onHead(...b.root, 0.0), onHead(...b.mid, 0.03), onHead(...b.tip, 0.018)];
    const geo = strandGeometry(pts, {
      radius: (t) => b.w * Math.sin(Math.PI * (0.25 + 0.75 * t)) ** 0.8 * (1 - t * 0.15),
      flat: 0.28, up: surfaceUp, segments: 16, radial: 10,
    });
    const m = new THREE.Mesh(geo, mats.fur);
    m.name = `Bang_${i}`;
    hair.add(m);
    if (outlines) m.add(makeOutline(geo, 0.008));
  });

  // Mèches latérales qui encadrent le visage.
  for (const side of [1, -1]) {
    const pts = [
      new THREE.Vector3(side * 0.45, 0.22, 0.13),
      new THREE.Vector3(side * 0.52, -0.06, 0.11),
      new THREE.Vector3(side * 0.51, -0.3, 0.07),
      new THREE.Vector3(side * 0.45, -0.5, 0.05),
    ];
    const geo = strandGeometry(pts, {
      radius: (t) => 0.078 * (1 - t) ** 0.6 + 0.004,
      flat: 0.32, up: () => new THREE.Vector3(side, 0, 0.3), segments: 18, radial: 10,
    });
    const m = new THREE.Mesh(geo, mats.fur);
    m.name = side > 0 ? 'SideLock_L' : 'SideLock_R';
    hair.add(m);
    if (outlines) m.add(makeOutline(geo, 0.008));
  }

  // Couette sur le côté gauche du personnage (à droite à l'écran).
  const pony = new THREE.Group();
  pony.name = 'PonytailPivot';
  pony.position.set(0.44, 0.27, -0.12);
  pony.rotation.z = 0;
  const ptsP = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.14, 0.03, 0),
    new THREE.Vector3(0.26, -0.15, 0.02),
    new THREE.Vector3(0.28, -0.5, 0.04),
    new THREE.Vector3(0.24, -0.8, 0.06),
    new THREE.Vector3(0.17, -1.02, 0.08),
  ];
  const ponyGeo = strandGeometry(ptsP, {
    radius: (t) => 0.07 * (1 - t) + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.2)) ** 0.6 * (1 - t) ** 0.6 + 0.003,
    flat: 0.75, up: () => new THREE.Vector3(1, 0, 0.4), segments: 40, radial: 14,
  });
  const ponyMesh = new THREE.Mesh(ponyGeo, mats.fur);
  ponyMesh.name = 'Ponytail';
  pony.add(ponyMesh);
  if (outlines) ponyMesh.add(makeOutline(ponyGeo, 0.012));
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.028, 10, 24), mats.hairTie);
  tie.name = 'HairTie';
  tie.position.set(0.07, 0.012, 0);
  tie.rotation.y = Math.PI / 2;
  tie.rotation.x = 0.2;
  pony.add(tie);
  if (outlines) tie.add(makeOutline(tie.geometry, 0.008));
  hair.add(pony);
  return hair;
}

// ------------------------------------------------------------------ Logo "FT"
function buildLogo(mats, torsoZ) {
  const logo = new THREE.Group();
  logo.name = 'Logo';
  const cx = 0.13, cy = -1.06, s = 0.95;
  const slant = 0.22;
  const conform = (geo, lift) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i);
      x = cx + (x + y * slant) * s;
      y = cy + y * s;
      p.setXYZ(i, x, y, torsoZ(x, y, lift));
    }
    geo.computeVertexNormals();
    return geo;
  };
  const rectShape = (pts) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]);
    sh.closePath();
    return sh;
  };
  // Lettre F
  const F = rectShape([
    [-0.02, -0.06], [0.0, -0.06], [0.0, -0.005], [0.04, -0.005], [0.04, 0.012], [0.0, 0.012],
    [0.0, 0.042], [0.05, 0.042], [0.05, 0.06], [-0.02, 0.06],
  ]);
  // Lettre T
  const T = rectShape([
    [0.065, 0.06], [0.14, 0.06], [0.14, 0.042], [0.112, 0.042], [0.112, -0.06], [0.092, -0.06],
    [0.092, 0.042], [0.065, 0.042],
  ]);
  for (const [shape, name] of [[F, 'Logo_F'], [T, 'Logo_T']]) {
    const m = new THREE.Mesh(conform(new THREE.ShapeGeometry(shape), 0.004), mats.logoText);
    m.name = name;
    logo.add(m);
  }
  // Virgule grise + point orange (la "flamme" du logo).
  const swirl = new THREE.Shape();
  swirl.absarc(-0.06, -0.012, 0.03, Math.PI * 0.45, Math.PI * 1.55, false);
  swirl.absarc(-0.052, -0.004, 0.018, Math.PI * 1.5, Math.PI * 0.5, true);
  const sw = new THREE.Mesh(conform(new THREE.ShapeGeometry(swirl, 12), 0.004), mats.logoGrey);
  sw.name = 'Logo_Swirl';
  logo.add(sw);
  const dot = new THREE.Shape();
  dot.absarc(-0.05, 0.047, 0.016, 0, Math.PI * 2, false);
  const dm = new THREE.Mesh(conform(new THREE.ShapeGeometry(dot, 12), 0.004), mats.logoOrange);
  dm.name = 'Logo_Dot';
  logo.add(dm);
  return logo;
}
