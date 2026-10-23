import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import type { PageBoxes, Dimension, BleedPerSide } from "../preflight.types";
import { PREFLIGHT_CONFIG, KNOWN_SIZES } from "../preflight.config";
import { resolve, parseBoxArray, ptToMm } from "./stream.utils";

// ── Internal type that carries both dimensions AND PDF user-space coordinates ──
interface BoxWithCoords {
  widthMm: number;
  heightMm: number;
  leftMm: number;
  bottomMm: number;
  rightMm: number;
  topMm: number;
}

function toDimension(b: BoxWithCoords): Dimension {
  return { widthMm: b.widthMm, heightMm: b.heightMm };
}

/**
 * Parse a PDF box array entry into full coordinates + dimensions (in mm).
 * Normalises so that left < right, bottom < top.
 */
function boxFromEntryFull(
  doc: PDFDocument,
  entry: unknown
): BoxWithCoords | undefined {
  const resolved = resolve(doc, entry);
  if (!(resolved instanceof PDFArray)) return undefined;
  const coords = parseBoxArray(doc, resolved);
  if (!coords) return undefined;

  const leftPt   = Math.min(coords.x1, coords.x2);
  const rightPt  = Math.max(coords.x1, coords.x2);
  const bottomPt = Math.min(coords.y1, coords.y2);
  const topPt    = Math.max(coords.y1, coords.y2);

  return {
    widthMm:  ptToMm(rightPt  - leftPt),
    heightMm: ptToMm(topPt    - bottomPt),
    leftMm:   ptToMm(leftPt),
    bottomMm: ptToMm(bottomPt),
    rightMm:  ptToMm(rightPt),
    topMm:    ptToMm(topPt),
  };
}

function detectSize(dim: Dimension): string | undefined {
  const tol = PREFLIGHT_CONFIG.sizeToleranceMm;
  const w = dim.widthMm;
  const h = dim.heightMm;
  for (const size of KNOWN_SIZES) {
    if (Math.abs(w - size.widthMm) <= tol && Math.abs(h - size.heightMm) <= tol) {
      return size.name;
    }
    if (Math.abs(w - size.heightMm) <= tol && Math.abs(h - size.widthMm) <= tol) {
      return `${size.name} (landscape)`;
    }
  }
  return undefined;
}

/**
 * Calculate per-side bleed from actual PDF coordinates.
 * Bleed is how far each side of the TrimBox is inset from the outer box.
 *
 * PDF user-space:
 *   esquerda (left)  = trimBox.left  - bleedBox.left   (TrimBox inset from left)
 *   direita  (right) = bleedBox.right - trimBox.right
 *   inferior (bottom)= trimBox.bottom - bleedBox.bottom
 *   superior (top)   = bleedBox.top  - trimBox.top
 */
function calcBleedPerSide(trim: BoxWithCoords, outer: BoxWithCoords): BleedPerSide {
  return {
    left:   Math.max(0, trim.leftMm   - outer.leftMm),
    right:  Math.max(0, outer.rightMm  - trim.rightMm),
    bottom: Math.max(0, trim.bottomMm  - outer.bottomMm),
    top:    Math.max(0, outer.topMm    - trim.topMm),
  };
}

export function analyzeBoxes(doc: PDFDocument, pageIndex: number): PageBoxes {
  const page = doc.getPage(pageIndex);
  const node = page.node;

  // ── MediaBox (required — may inherit from parent) ──────────────────────────
  let mediaBoxFull: BoxWithCoords;
  try {
    const mb = page.getMediaBox();
    const leftPt   = mb.x;
    const bottomPt = mb.y;
    const rightPt  = mb.x + mb.width;
    const topPt    = mb.y + mb.height;
    mediaBoxFull = {
      widthMm:  ptToMm(mb.width),
      heightMm: ptToMm(mb.height),
      leftMm:   ptToMm(leftPt),
      bottomMm: ptToMm(bottomPt),
      rightMm:  ptToMm(rightPt),
      topMm:    ptToMm(topPt),
    };
  } catch {
    mediaBoxFull = { widthMm: 0, heightMm: 0, leftMm: 0, bottomMm: 0, rightMm: 0, topMm: 0 };
  }
  const mediaBox = toDimension(mediaBoxFull);

  // ── Optional boxes ─────────────────────────────────────────────────────────
  const cropBoxFull  = boxFromEntryFull(doc, node.get(PDFName.of("CropBox")));
  const bleedBoxFull = boxFromEntryFull(doc, node.get(PDFName.of("BleedBox")));
  const trimBoxFull  = boxFromEntryFull(doc, node.get(PDFName.of("TrimBox")));
  const artBoxFull   = boxFromEntryFull(doc, node.get(PDFName.of("ArtBox")));

  const cropBox  = cropBoxFull  ? toDimension(cropBoxFull)  : undefined;
  const bleedBox = bleedBoxFull ? toDimension(bleedBoxFull) : undefined;
  const trimBox  = trimBoxFull  ? toDimension(trimBoxFull)  : undefined;
  const artBox   = artBoxFull   ? toDimension(artBoxFull)   : undefined;

  // ── Final size: TrimBox > CropBox > MediaBox ───────────────────────────────
  let finalSize: Dimension;
  let finalSizeSource: "TrimBox" | "CropBox" | "MediaBox";

  if (trimBox) {
    finalSize = trimBox;
    finalSizeSource = "TrimBox";
  } else if (cropBox) {
    finalSize = cropBox;
    finalSizeSource = "CropBox";
  } else {
    finalSize = mediaBox;
    finalSizeSource = "MediaBox";
  }

  const orientation: "portrait" | "landscape" | "square" =
    finalSize.widthMm < finalSize.heightMm
      ? "portrait"
      : finalSize.widthMm > finalSize.heightMm
      ? "landscape"
      : "square";

  const detectedSize = detectSize(finalSize);

  // ── Bleed calculation ──────────────────────────────────────────────────────
  let hasBleed = false;
  let bleedMm: number | undefined;
  let bleedOk: boolean | undefined;
  let bleedPerSide: BleedPerSide | undefined;
  const bleedConfirmed = !!bleedBoxFull;

  if (trimBoxFull && bleedBoxFull) {
    // Preferred: TrimBox vs BleedBox — both from PDF metadata
    bleedPerSide = calcBleedPerSide(trimBoxFull, bleedBoxFull);
  } else if (trimBoxFull && !bleedBoxFull) {
    // Fallback: TrimBox vs MediaBox — bleed is "implied" by the media size
    bleedPerSide = calcBleedPerSide(trimBoxFull, mediaBoxFull);
  }

  if (bleedPerSide) {
    const sides = [bleedPerSide.left, bleedPerSide.right, bleedPerSide.top, bleedPerSide.bottom];
    bleedMm = sides.reduce((a, b) => a + b, 0) / 4; // average for backward compat
    const minSide = Math.min(...sides);
    hasBleed = minSide > 0;
    bleedOk =
      minSide >=
      PREFLIGHT_CONFIG.minimumBleedMm - PREFLIGHT_CONFIG.bleedToleranceMm;
  }

  return {
    mediaBox,
    ...(cropBox  ? { cropBox  } : {}),
    ...(bleedBox ? { bleedBox } : {}),
    ...(trimBox  ? { trimBox  } : {}),
    ...(artBox   ? { artBox   } : {}),
    finalSize,
    finalSizeSource,
    ...(detectedSize ? { detectedSize } : {}),
    orientation,
    hasBleed,
    bleedConfirmed,
    ...(bleedMm      !== undefined ? { bleedMm      } : {}),
    ...(bleedPerSide !== undefined ? { bleedPerSide } : {}),
    ...(bleedOk      !== undefined ? { bleedOk      } : {}),
  };
}
