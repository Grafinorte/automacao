import { PDFDocument, PDFName, PDFDict, PDFNumber, PDFArray } from "pdf-lib";
import type { TransparencyInfo } from "../preflight.types";
import { resolve, getPageResources } from "./stream.utils";

function checkExtGStateForTransparency(
  doc: PDFDocument,
  gsDict: PDFDict,
  details: string[]
): boolean {
  let found = false;

  try {
    // Fill opacity: ca
    const ca = gsDict.get(PDFName.of("ca"));
    if (ca instanceof PDFNumber && ca.asNumber() < 1) {
      details.push(`Fill opacity (ca): ${ca.asNumber().toFixed(2)}`);
      found = true;
    }

    // Stroke opacity: CA
    const CA = gsDict.get(PDFName.of("CA"));
    if (CA instanceof PDFNumber && CA.asNumber() < 1) {
      details.push(`Stroke opacity (CA): ${CA.asNumber().toFixed(2)}`);
      found = true;
    }

    // SMask
    const smask = gsDict.get(PDFName.of("SMask"));
    if (smask && !(smask instanceof PDFName && smask.asString().replace(/^\//, "") === "None")) {
      details.push("SMask presente no ExtGState");
      found = true;
    }

    // Blend mode
    const bm = gsDict.get(PDFName.of("BM"));
    if (bm instanceof PDFName) {
      const bmName = bm.asString().replace(/^\//, "");
      if (bmName !== "Normal" && bmName !== "Compatible") {
        details.push(`Blend mode (BM): ${bmName}`);
        found = true;
      }
    } else if (bm instanceof PDFArray) {
      details.push("Blend mode array presente");
      found = true;
    }
  } catch {
    // ignore
  }

  return found;
}

function checkXObjectsForTransparency(
  doc: PDFDocument,
  resources: PDFDict,
  visited: Set<number>,
  details: string[],
  depth: number
): boolean {
  if (depth > 5) return false;

  let found = false;

  try {
    const xobjEntry = resources.get(PDFName.of("XObject"));
    if (!xobjEntry) return false;
    const xobjDict = resolve(doc, xobjEntry);
    if (!(xobjDict instanceof PDFDict)) return false;

    for (const [, value] of xobjDict.entries()) {
      const xobj = resolve(doc, value);
      if (!(xobj instanceof PDFDict)) continue;

      const subtype = xobj.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName)) continue;
      if (subtype.asString().replace(/^\//, "") !== "Form") continue;

      if (value instanceof PDFName) {
        // skip, not a ref
      }

      // Check for transparency group
      const groupEntry = xobj.get(PDFName.of("Group"));
      if (groupEntry) {
        const group = resolve(doc, groupEntry);
        if (group instanceof PDFDict) {
          const sEntry = group.get(PDFName.of("S"));
          if (sEntry instanceof PDFName && sEntry.asString().replace(/^\//, "") === "Transparency") {
            details.push("Form XObject com transparency group");
            found = true;
          }
        }
      }

      // Recurse into form XObject resources
      const formRes = xobj.get(PDFName.of("Resources"));
      if (formRes) {
        const formResDict = resolve(doc, formRes);
        if (formResDict instanceof PDFDict) {
          // Check ExtGState in form
          const formGS = formResDict.get(PDFName.of("ExtGState"));
          if (formGS) {
            const gsDict = resolve(doc, formGS);
            if (gsDict instanceof PDFDict) {
              for (const [, gsValue] of gsDict.entries()) {
                const gsState = resolve(doc, gsValue);
                if (gsState instanceof PDFDict) {
                  if (checkExtGStateForTransparency(doc, gsState, details)) found = true;
                }
              }
            }
          }
          if (checkXObjectsForTransparency(doc, formResDict, visited, details, depth + 1)) {
            found = true;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return found;
}

export function analyzeTransparency(doc: PDFDocument, pageIndex: number): TransparencyInfo {
  const details: string[] = [];
  let hasTransparency = false;

  try {
    const resources = getPageResources(doc, pageIndex);
    if (!resources) {
      return { hasTransparency: false, confidence: "confirmed", details: [] };
    }

    // Check ExtGState entries
    const extGStateEntry = resources.get(PDFName.of("ExtGState"));
    if (extGStateEntry) {
      const gsDict = resolve(doc, extGStateEntry);
      if (gsDict instanceof PDFDict) {
        for (const [, value] of gsDict.entries()) {
          const gsState = resolve(doc, value);
          if (gsState instanceof PDFDict) {
            if (checkExtGStateForTransparency(doc, gsState, details)) {
              hasTransparency = true;
            }
          }
        }
      }
    }

    // Check XObjects (form XObjects may contain transparency)
    const visited = new Set<number>();
    if (checkXObjectsForTransparency(doc, resources, visited, details, 0)) {
      hasTransparency = true;
    }
  } catch {
    return { hasTransparency: false, confidence: "unknown", details: [] };
  }

  return {
    hasTransparency,
    confidence: "confirmed",
    details,
  };
}
