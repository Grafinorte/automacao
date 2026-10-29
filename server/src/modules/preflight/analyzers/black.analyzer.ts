import type { BlackInfo } from "../preflight.types";
import { getPageContentStreamText } from "./stream.utils";
import { PDFDocument } from "pdf-lib";
import { PREFLIGHT_CONFIG } from "../preflight.config";

function isRichBlack(c: number, m: number, y: number, k: number): boolean {
  return c > 0.01 && m > 0.01 && y > 0.01 && k > 0.01 && k >= c && k >= m && k >= y;
}

function isNumericToken(s: string): boolean {
  if (!s) return false;
  return !s.startsWith("/") && !isNaN(parseFloat(s)) && isFinite(Number(s));
}

/**
 * Count how many consecutive numeric tokens precede index i (backwards, max 4).
 */
function countPrecedingNumbers(tokens: string[], i: number): number {
  let n = 0;
  for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
    if (isNumericToken(tokens[j])) n++;
    else break;
  }
  return n;
}

export function analyzeBlack(doc: PDFDocument, pageIndex: number): BlackInfo {
  const result: BlackInfo = {
    has100K: false,
    hasRichBlack: false,
    hasRgbBlack: false,
    richBlackInText: false,
    richBlackSmallText: false,
    rgbBlackInText: false,
    confidence: "unknown",
  };

  const streamText = getPageContentStreamText(doc, pageIndex);
  if (!streamText) return result;

  result.confidence = "estimated";

  // Continuous color state — updated by any color operator, regardless of BT/ET position
  let fillC = 0, fillM = 0, fillY = 0, fillK = 0;
  let fillColorMode: "cmyk" | "rgb" | "gray" | "none" = "none";
  let fillR = 0, fillG = 0, fillB = 0;
  let fillGrayVal = 0;

  let inText = false;
  let currentFontSizePt = 12;

  const tokens = streamText.match(/\/[\w#.]+|<<|>>|[\[\]]|[^\s\[\]<>\/]+/g) ?? [];

  function applyFillCmyk(c: number, m: number, y: number, k: number) {
    fillC = c; fillM = m; fillY = y; fillK = k;
    fillColorMode = "cmyk";
    if (isRichBlack(c, m, y, k)) result.hasRichBlack = true;
    if (Math.abs(c) < 0.01 && Math.abs(m) < 0.01 && Math.abs(y) < 0.01 && Math.abs(k - 1) < 0.01) {
      result.has100K = true;
    }
  }

  function applyFillRgb(r: number, g: number, b: number) {
    fillR = r; fillG = g; fillB = b;
    fillColorMode = "rgb";
    if (r < 0.01 && g < 0.01 && b < 0.01) result.hasRgbBlack = true;
  }

  function applyFillGray(gray: number) {
    fillGrayVal = gray;
    fillColorMode = "gray";
    if (gray < 0.01) result.has100K = true;
  }

  /**
   * When a text-drawing op fires inside BT, evaluate CURRENT fill color for rich black.
   */
  function onTextDraw(): void {
    if (!inText) return;

    // Debug: log the state at draw time
    console.log(
      `[Black] p${pageIndex + 1} text-draw mode=${fillColorMode}` +
      (fillColorMode === "cmyk" ? ` CMYK=${fillC.toFixed(2)}/${fillM.toFixed(2)}/${fillY.toFixed(2)}/${fillK.toFixed(2)}` : "") +
      (fillColorMode === "rgb"  ? ` RGB=${fillR.toFixed(2)}/${fillG.toFixed(2)}/${fillB.toFixed(2)}` : "") +
      (fillColorMode === "gray" ? ` Gray=${fillGrayVal.toFixed(2)}` : "") +
      ` fontSize=${currentFontSizePt}pt`
    );

    if (fillColorMode === "gray") {
      if (fillGrayVal < 0.01) result.has100K = true;
      return;
    }

    if (fillColorMode === "rgb") {
      if (fillR < 0.01 && fillG < 0.01 && fillB < 0.01) {
        result.hasRgbBlack = true;
        result.rgbBlackInText = true;
      }
      return;
    }

    if (fillColorMode === "cmyk" || fillColorMode === "none") {
      // "none" means we haven't seen an explicit color op — default CMYK 0/0/0/0 (white), skip
      if (fillColorMode === "none") return;

      const allZero = (v: number) => Math.abs(v) < 0.01;
      const nearOne = (v: number) => Math.abs(v - 1) < 0.01;

      if (allZero(fillC) && allZero(fillM) && allZero(fillY) && nearOne(fillK)) {
        result.has100K = true;
      } else if (isRichBlack(fillC, fillM, fillY, fillK)) {
        result.hasRichBlack = true;
        result.richBlackInText = true;
        const isSmall = currentFontSizePt <= PREFLIGHT_CONFIG.richBlackTextMaxPtWarning;
        if (isSmall) result.richBlackSmallText = true;
        console.log(
          `[Black] p${pageIndex + 1} RICH BLACK IN TEXT` +
          ` CMYK=${fillC.toFixed(2)}/${fillM.toFixed(2)}/${fillY.toFixed(2)}/${fillK.toFixed(2)}` +
          ` size=${currentFontSizePt}pt isSmall=${isSmall}`
        );
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // ── Text block ──
    if (t === "BT") { inText = true; continue; }
    if (t === "ET") { inText = false; continue; }

    // ── Font size: /Name size Tf ──
    if (t === "Tf" && i >= 1) {
      const sizeVal = parseFloat(tokens[i - 1]);
      if (!isNaN(sizeVal) && sizeVal > 0) {
        currentFontSizePt = sizeVal;
      }
      continue;
    }

    // ── CMYK fill: c m y k k ──
    if (t === "k" && i >= 4) {
      const vals = [tokens[i-4], tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
      if (vals.every((v) => !isNaN(v))) {
        applyFillCmyk(vals[0], vals[1], vals[2], vals[3]);
      }
      continue;
    }

    // ── CMYK stroke: c m y k K ──
    if (t === "K" && i >= 4) {
      const vals = [tokens[i-4], tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
      if (vals.every((v) => !isNaN(v)) && isRichBlack(vals[0], vals[1], vals[2], vals[3])) {
        result.hasRichBlack = true;
      }
      continue;
    }

    // ── RGB fill: r g b rg ──
    if (t === "rg" && i >= 3) {
      const vals = [tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
      if (vals.every((v) => !isNaN(v))) applyFillRgb(vals[0], vals[1], vals[2]);
      continue;
    }

    // ── RGB stroke: r g b RG ──
    if (t === "RG" && i >= 3) {
      const vals = [tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
      if (vals.every((v) => !isNaN(v))) {
        if (vals[0] < 0.01 && vals[1] < 0.01 && vals[2] < 0.01) result.hasRgbBlack = true;
      }
      continue;
    }

    // ── Gray fill: gray g ──
    if (t === "g" && i >= 1) {
      const gray = parseFloat(tokens[i - 1]);
      if (!isNaN(gray)) applyFillGray(gray);
      continue;
    }

    // ── Gray stroke: gray G ──
    if (t === "G" && i >= 1) {
      // stroke only — we don't update fill state
      continue;
    }

    // ── scn / sc — generic "set fill color in current color space" ──
    // InDesign and Illustrator use this with ICCBased CMYK instead of k.
    // We detect channel count from how many consecutive numerics precede the operator.
    if (t === "scn" || t === "sc") {
      const nArgs = countPrecedingNumbers(tokens, i);
      if (nArgs === 4) {
        const vals = [tokens[i-4], tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
        if (vals.every((v) => !isNaN(v))) applyFillCmyk(vals[0], vals[1], vals[2], vals[3]);
      } else if (nArgs === 3) {
        const vals = [tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
        if (vals.every((v) => !isNaN(v))) applyFillRgb(vals[0], vals[1], vals[2]);
      } else if (nArgs === 1) {
        const gray = parseFloat(tokens[i - 1]);
        if (!isNaN(gray)) applyFillGray(gray);
      }
      continue;
    }

    // ── SCN / SC — generic "set stroke color" ──
    if (t === "SCN" || t === "SC") {
      const nArgs = countPrecedingNumbers(tokens, i);
      if (nArgs === 4) {
        const vals = [tokens[i-4], tokens[i-3], tokens[i-2], tokens[i-1]].map(parseFloat);
        if (vals.every((v) => !isNaN(v)) && isRichBlack(vals[0], vals[1], vals[2], vals[3])) {
          result.hasRichBlack = true;
        }
      }
      continue;
    }

    // ── Text show operators ── check fill color at actual draw time
    if (inText && (t === "Tj" || t === "TJ" || t === "'" || t === '"')) {
      onTextDraw();
      continue;
    }
  }

  if (result.has100K || result.hasRichBlack || result.hasRgbBlack) {
    result.confidence = "estimated";
  }

  return result;
}
