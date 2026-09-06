/**
 * Rectangular nesting for sheet goods.
 *
 * Uses MaxRects with a best-short-side-fit heuristic: the sheet is kept as a set
 * of maximal free rectangles, and each part goes into the free rectangle that
 * leaves the tightest fit. It is not a true irregular nester — ArtCAM keeps that
 * job — but for the panel and strip work that dominates decor production it gets
 * within a few percent of hand-nesting, instantly, and it gives us the offcut
 * geometry that the waste ledger needs.
 *
 * Kerf is added to every part's footprint, so the placements returned are real
 * cut positions rather than optimistic ones.
 */

export interface NestPartInput {
  id: string;
  label: string;
  lengthMm: number;
  widthMm: number;
  quantity: number;
  /** Grain-sensitive parts (veneer, stone veining) may not be rotated. */
  allowRotation?: boolean;
}

export interface NestPlacement {
  partId: string;
  label: string;
  sheetIndex: number;
  xMm: number;
  yMm: number;
  lengthMm: number;
  widthMm: number;
  rotationDeg: 0 | 90;
}

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NestOptions {
  sheetLengthMm: number;
  sheetWidthMm: number;
  kerfMm?: number;
  /** Untrimmed edge left around the sheet, mm. */
  marginMm?: number;
  maxSheets?: number;
}

export interface NestResult {
  placements: NestPlacement[];
  unplaced: { partId: string; label: string; quantity: number }[];
  sheetsUsed: number;
  /** Leftover maximal rectangles per sheet — the candidate offcuts. */
  freeRects: FreeRect[][];
}

interface PendingPart extends NestPartInput {
  area: number;
}

export function nestParts(
  parts: NestPartInput[],
  options: NestOptions,
): NestResult {
  const kerf = options.kerfMm ?? 0;
  const margin = options.marginMm ?? 0;
  const maxSheets = options.maxSheets ?? 50;
  const usableW = options.sheetLengthMm - margin * 2;
  const usableH = options.sheetWidthMm - margin * 2;

  // Biggest parts first: the classic decreasing-area ordering, which beats
  // arrival order badly on mixed panel work.
  const queue: PendingPart[] = parts
    .flatMap((part) =>
      Array.from({ length: Math.max(part.quantity, 0) }, () => ({
        ...part,
        quantity: 1,
        area: part.lengthMm * part.widthMm,
      })),
    )
    .sort((a, b) => b.area - a.area || Math.max(b.lengthMm, b.widthMm) - Math.max(a.lengthMm, a.widthMm));

  const placements: NestPlacement[] = [];
  const unplaced: NestResult['unplaced'] = [];
  const sheets: FreeRect[][] = [];

  for (const part of queue) {
    let placed = false;

    for (let sheetIndex = 0; sheetIndex < sheets.length && !placed; sheetIndex += 1) {
      placed = tryPlace(part, sheets[sheetIndex], sheetIndex, kerf, margin, placements);
    }

    while (!placed && sheets.length < maxSheets) {
      const fresh: FreeRect[] = [{ x: margin, y: margin, w: usableW, h: usableH }];
      sheets.push(fresh);
      placed = tryPlace(part, fresh, sheets.length - 1, kerf, margin, placements);
      if (!placed) break; // part is larger than a whole sheet
    }

    if (!placed) {
      const existing = unplaced.find((u) => u.partId === part.id);
      if (existing) existing.quantity += 1;
      else unplaced.push({ partId: part.id, label: part.label, quantity: 1 });
    }
  }

  return {
    placements,
    unplaced,
    sheetsUsed: sheets.length,
    freeRects: sheets,
  };
}

function tryPlace(
  part: PendingPart,
  free: FreeRect[],
  sheetIndex: number,
  kerf: number,
  margin: number,
  placements: NestPlacement[],
): boolean {
  const allowRotation = part.allowRotation !== false;
  const candidates: { w: number; h: number; rotation: 0 | 90 }[] = [
    { w: part.lengthMm + kerf, h: part.widthMm + kerf, rotation: 0 },
  ];
  if (allowRotation && part.lengthMm !== part.widthMm) {
    candidates.push({ w: part.widthMm + kerf, h: part.lengthMm + kerf, rotation: 90 });
  }

  interface Candidate {
    rectIndex: number;
    w: number;
    h: number;
    rotation: 0 | 90;
    shortLeftover: number;
    longLeftover: number;
  }

  let best: Candidate | null = null;

  free.forEach((rect, rectIndex) => {
    for (const candidate of candidates) {
      if (candidate.w > rect.w || candidate.h > rect.h) continue;

      const leftoverX = rect.w - candidate.w;
      const leftoverY = rect.h - candidate.h;
      const shortLeftover = Math.min(leftoverX, leftoverY);
      const longLeftover = Math.max(leftoverX, leftoverY);

      const current: Candidate = { rectIndex, ...candidate, shortLeftover, longLeftover };
      if (
        best === null ||
        current.shortLeftover < best.shortLeftover ||
        (current.shortLeftover === best.shortLeftover &&
          current.longLeftover < best.longLeftover)
      ) {
        best = current;
      }
    }
  });

  if (best === null) return false;

  const chosen: Candidate = best;
  const target = free[chosen.rectIndex];
  placements.push({
    partId: part.id,
    label: part.label,
    sheetIndex,
    xMm: target.x,
    yMm: target.y,
    lengthMm: chosen.rotation === 0 ? part.lengthMm : part.widthMm,
    widthMm: chosen.rotation === 0 ? part.widthMm : part.lengthMm,
    rotationDeg: chosen.rotation,
  });

  splitFreeRects(free, { x: target.x, y: target.y, w: chosen.w, h: chosen.h });
  pruneContained(free);
  return true;
}

/** Replace every free rect the placement overlaps with its maximal remainders. */
function splitFreeRects(free: FreeRect[], used: FreeRect): void {
  for (let i = free.length - 1; i >= 0; i -= 1) {
    const rect = free[i];
    if (!overlaps(rect, used)) continue;

    free.splice(i, 1);

    // Left slice
    if (used.x > rect.x) {
      free.push({ x: rect.x, y: rect.y, w: used.x - rect.x, h: rect.h });
    }
    // Right slice
    if (used.x + used.w < rect.x + rect.w) {
      free.push({
        x: used.x + used.w,
        y: rect.y,
        w: rect.x + rect.w - (used.x + used.w),
        h: rect.h,
      });
    }
    // Bottom slice
    if (used.y > rect.y) {
      free.push({ x: rect.x, y: rect.y, w: rect.w, h: used.y - rect.y });
    }
    // Top slice
    if (used.y + used.h < rect.y + rect.h) {
      free.push({
        x: rect.x,
        y: used.y + used.h,
        w: rect.w,
        h: rect.y + rect.h - (used.y + used.h),
      });
    }
  }
}

function overlaps(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Maximal-rectangle bookkeeping: drop any rect fully inside another. */
function pruneContained(free: FreeRect[]): void {
  for (let i = free.length - 1; i >= 0; i -= 1) {
    for (let j = free.length - 1; j >= 0; j -= 1) {
      if (i === j) continue;
      if (contains(free[j], free[i])) {
        free.splice(i, 1);
        break;
      }
    }
  }
}

function contains(outer: FreeRect, inner: FreeRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export interface RecoverableOffcut extends FreeRect {
  sheetIndex: number;
}

/**
 * Pick the offcuts that can actually be cut from what the nest left over.
 *
 * MaxRects keeps *maximal* free rectangles, and those overlap each other by
 * design — one empty L-shaped region is represented as two rectangles sharing a
 * corner. Summing their areas double-counts the leftover, which is how a sheet
 * ends up reporting more than 100% utilisation.
 *
 * So take the largest free rectangle, claim it, discard everything that
 * overlaps it, and repeat. That mirrors the physical act of cutting an offcut
 * out of the drop: once the big piece is taken, the rectangles that ran through
 * it no longer exist.
 */
export function selectRecoverableOffcuts(
  freeRects: FreeRect[][],
  isRecoverable: (lengthMm: number, widthMm: number) => boolean,
): RecoverableOffcut[] {
  const chosen: RecoverableOffcut[] = [];

  freeRects.forEach((sheet, sheetIndex) => {
    const candidates = [...sheet].sort((a, b) => b.w * b.h - a.w * a.h);
    const taken: FreeRect[] = [];

    for (const rect of candidates) {
      if (!isRecoverable(rect.w, rect.h)) continue;
      if (taken.some((claimed) => overlaps(claimed, rect))) continue;
      taken.push(rect);
      chosen.push({...rect, sheetIndex});
    }
  });

  return chosen;
}
