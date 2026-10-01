/**
 * Données d'animation du sprite de Ludo, en "vrais" pixels (grille 68 × 68).
 *
 * Le sprite d'origine (ludo.webp, 1024 px) est du pixel-art agrandi : un
 * pixel logique fait GRID.size px, décalé de (GRID.ox, GRID.oy). Toutes les
 * coordonnées ci-dessous sont en cellules de cette grille.
 *
 * Légende des motifs :
 *   .  peau (recopiée depuis une cellule de peau de l'image, grain compris)
 *   #  contour brun        K  noir des yeux     B  sourcil
 *   R  intérieur bouche    T  langue            W  dents / reflet blanc
 *   _  transparent (laisse voir l'image d'origine)
 */
export const GRID = { size: 15.25, ox: 2, oy: -2.5, cells: 68 };

/** Cellule de peau "propre" utilisée comme texture de remplissage. */
export const SKIN_CELL = [30, 43];

export const COLORS = {
  '#': '#5a4622',
  K: '#1d1f19',
  B: '#5d4b21',
  R: '#6b2a1c',
  T: '#d9786a',
  W: '#fffaf0',
};

// ----------------------------------------------------------------- Bouche
/** Zone de la bouche : colonnes 20..31, lignes 43..47 (le sillon nez-bouche est en (25, 43)). */
export const MOUTH_ORIGIN = [20, 43];

export const MOUTHS = {
  closed: [
    '.....#......',
    '...######...',
    '............',
    '............',
    '............',
  ],
  small: [
    '.....#......',
    '...######...',
    '....#RR#....',
    '.....##.....',
    '............',
  ],
  open: [
    '.....#......',
    '..########..',
    '..#RRRRRR#..',
    '...#RTTR#...',
    '....####....',
  ],
  wide: [
    '.....#......',
    '.##########.',
    '.#WWWWWWWW#.',
    '..########..',
    '............',
  ],
  O: [
    '.....#......',
    '....####....',
    '...#RRRR#...',
    '...#RTTR#...',
    '....####....',
  ],
  U: [
    '.....#......',
    '.....##.....',
    '....#RR#....',
    '.....##.....',
    '............',
  ],
  FF: [
    '.....#......',
    '...######...',
    '...#WWWW#...',
    '....####....',
    '............',
  ],
  smile: [
    '.....#......',
    '..#......#..',
    '...######...',
    '............',
    '............',
  ],
  grin: [
    '.....#......',
    '..########..',
    '..#WWWWWW#..',
    '...#RRRR#...',
    '....####....',
  ],
  frown: [
    '.....#......',
    '....####....',
    '...#....#...',
    '............',
    '............',
  ],
  smirk: [
    '.....#..#...',
    '...#####....',
    '............',
    '............',
    '............',
  ],
  side: [
    '.....#......',
    '.....####...',
    '............',
    '............',
    '............',
  ],
};

/** Forme de bouche associée à chaque visème. */
export const VISEME_TO_MOUTH = {
  sil: 'closed', PP: 'closed', FF: 'FF', TH: 'small', DD: 'small', kk: 'small', CH: 'wide',
  SS: 'wide', nn: 'small', RR: 'U', aa: 'open', E: 'wide', I: 'wide', O: 'O', U: 'U',
};

/** Choisit la forme de bouche dominante parmi des poids de visèmes. */
export function mouthForVisemes(weights, threshold = 0.18) {
  let best = null;
  let bestW = threshold;
  for (const [v, w] of Object.entries(weights ?? {})) {
    if (v !== 'sil' && w > bestW) { best = v; bestW = w; }
  }
  return best ? VISEME_TO_MOUTH[best] ?? 'small' : null;
}

// ----------------------------------------------------------------- Yeux
/** Zones des yeux (intérieur des verres) : [col0, row0, largeur, hauteur]. */
export const EYE_BOXES = { left: [15, 32, 7, 6], right: [30, 32, 8, 6] };

/** Paupière (ligne du haut) et pupille de chaque œil au repos, en coordonnées absolues. */
const EYE = {
  left: { lid: [16, 20], pupil: [18, 20] },
  right: { lid: [31, 36], pupil: [32, 34] },
};
const LID_ROW = 33;

const span = (a, b, row, ch = 'K') => {
  const out = [];
  for (let c = a; c <= b; c++) out.push([c, row, ch]);
  return out;
};

/**
 * Pixels d'un œil pour une forme donnée.
 * shape : open | half | closed | happy | wide | sad | angry
 * gx, gy : décalage du regard (-1..1).
 */
export function eyePixels(side, shape = 'open', gx = 0, gy = 0) {
  const { lid, pupil } = EYE[side];
  const [l0, l1] = lid;
  const [p0, p1] = [pupil[0] + gx, pupil[1] + gx];
  const inner = side === 'left' ? 1 : -1; // direction du nez à l'écran
  const px = [];
  switch (shape) {
    case 'closed':
      px.push(...span(l0, l1, LID_ROW + 2));
      break;
    case 'half':
      px.push(...span(l0, l1, LID_ROW + 1));
      for (let r = LID_ROW + 2; r <= LID_ROW + 3; r++) px.push(...span(p0, p1, r));
      break;
    case 'happy': // ∩
      px.push(...span(l0 + 1, l1 - 1, LID_ROW + 1));
      px.push([l0, LID_ROW + 2, 'K'], [l1, LID_ROW + 2, 'K']);
      break;
    case 'wide': {
      const a = Math.round((l0 + l1) / 2) - 2 + gx, b = a + 3;
      px.push(...span(a + 1, b - 1, LID_ROW));
      for (let r = LID_ROW + 1; r <= LID_ROW + 3; r++) px.push(...span(a, b, r));
      px.push(...span(a + 1, b - 1, LID_ROW + 4));
      px.push([a + 1, LID_ROW + 1, 'W']);
      break;
    }
    case 'sad': { // paupière qui tombe vers l'extérieur
      const mid = Math.round((l0 + l1) / 2);
      if (inner > 0) { px.push(...span(mid, l1, LID_ROW), ...span(l0, mid - 1, LID_ROW + 1)); }
      else { px.push(...span(l0, mid, LID_ROW), ...span(mid + 1, l1, LID_ROW + 1)); }
      for (let r = LID_ROW + 1; r <= LID_ROW + 3; r++) px.push(...span(p0, p1, r));
      break;
    }
    case 'angry': { // paupière qui descend vers le nez
      const mid = Math.round((l0 + l1) / 2);
      if (inner > 0) { px.push(...span(l0, mid - 1, LID_ROW), ...span(mid, l1, LID_ROW + 1)); }
      else { px.push(...span(mid + 1, l1, LID_ROW), ...span(l0, mid, LID_ROW + 1)); }
      for (let r = LID_ROW + 2; r <= LID_ROW + 3; r++) px.push(...span(p0, p1, r));
      break;
    }
    default: // open
      px.push(...span(l0, l1, LID_ROW));
      for (let r = LID_ROW + 1 + gy; r <= LID_ROW + 3 + gy; r++) px.push(...span(p0, p1, r));
  }
  return px;
}

// ----------------------------------------------------------------- Sourcil
/** Zone du sourcil visible (l'autre est caché par la frange). */
export const BROW_BOX = [31, 26, 6, 4];

export function browPixels(shape = 'neutral') {
  switch (shape) {
    case 'up': return [...span(31, 36, 26, 'B'), ...span(31, 36, 27, 'B')];
    case 'angry': return [...span(34, 36, 27, 'B'), ...span(31, 35, 28, 'B'), ...span(31, 32, 29, 'B')];
    case 'sad': return [...span(31, 32, 26, 'B'), ...span(31, 36, 27, 'B'), ...span(34, 36, 28, 'B')];
    default: return [...span(31, 36, 27, 'B'), ...span(31, 36, 28, 'B')];
  }
}

// ----------------------------------------------------------------- Parties mobiles
/** Bouts d'oreilles (rectangles de cellules) et direction "vers l'extérieur". */
export const EAR_TIPS = {
  left: { box: [11, 4, 10, 6], out: -1 },
  right: { box: [39, 4, 10, 6], out: 1 },
};

/** Pointe de la couette (se balance). */
export const PONYTAIL = [50, 51, 11, 7];

/** Bulle de réflexion "..." (cellules). */
export const THINK_DOTS = [[52, 9], [56, 6], [60, 3]];

// ----------------------------------------------------------------- Expressions
/**
 * Pour chaque expression : forme des yeux, du sourcil, bouche au repos.
 * `eyes` peut être un couple [gauche, droite] (clin d'œil).
 */
export const EXPRESSIONS = {
  neutral: { eyes: 'open', brow: 'neutral', mouth: 'closed' },
  happy: { eyes: 'happy', brow: 'up', mouth: 'grin' },
  sad: { eyes: 'sad', brow: 'sad', mouth: 'frown' },
  surprised: { eyes: 'wide', brow: 'up', mouth: 'U' },
  angry: { eyes: 'angry', brow: 'angry', mouth: 'frown' },
  thinking: { eyes: 'open', brow: 'up', mouth: 'side', gaze: [-1, -1] },
  wink: { eyes: ['open', 'happy'], brow: 'up', mouth: 'smile' },
  smug: { eyes: 'half', brow: 'neutral', mouth: 'smirk' },
};

export const STATES = ['idle', 'listening', 'thinking', 'speaking'];
