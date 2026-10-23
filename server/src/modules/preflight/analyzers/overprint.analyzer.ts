import { PDFDocument, PDFName, PDFDict, PDFBool } from "pdf-lib";
import type { OverprintInfo } from "../preflight.types";
import { resolve, getPageResources } from "./stream.utils";

export function analyzeOverprint(doc: PDFDocument, pageIndex: number): OverprintInfo {
  const details: string[] = [];
  let hasOverprint = false;

  try {
    const resources = getPageResources(doc, pageIndex);
    if (!resources) {
      return { hasOverprint: false, confidence: "confirmed", details: [] };
    }

    const extGStateEntry = resources.get(PDFName.of("ExtGState"));
    if (!extGStateEntry) {
      return { hasOverprint: false, confidence: "confirmed", details: [] };
    }

    const gsDict = resolve(doc, extGStateEntry);
    if (!(gsDict instanceof PDFDict)) {
      return { hasOverprint: false, confidence: "confirmed", details: [] };
    }

    for (const [key, value] of gsDict.entries()) {
      const gsState = resolve(doc, value);
      if (!(gsState instanceof PDFDict)) continue;

      const gsName = key instanceof PDFName ? key.asString().replace(/^\//, "") : String(key);

      // OP: overprint for stroke
      const OP = gsState.get(PDFName.of("OP"));
      if (OP instanceof PDFBool && OP.asBoolean() === true) {
        details.push(`Estado gráfico ${gsName}: OP (overprint stroke) = true`);
        hasOverprint = true;
      }

      // op: overprint for fill (lowercase)
      const op = gsState.get(PDFName.of("op"));
      if (op instanceof PDFBool && op.asBoolean() === true) {
        details.push(`Estado gráfico ${gsName}: op (overprint fill) = true`);
        hasOverprint = true;
      }

      // OPM: overprint mode (1 = PDF 1.3+ overprint)
      // We note it but don't flag as hasOverprint unless OP/op is also set
    }
  } catch {
    return { hasOverprint: false, confidence: "unknown", details: [] };
  }

  return {
    hasOverprint,
    confidence: "confirmed",
    details,
  };
}
